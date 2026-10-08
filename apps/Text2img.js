import { ComfyPlugin as plugin } from '../utils/base.js'
import Config from '../components/Config.js'
import Code from '../components/Core.js'
import { parseCommandString, extractPrompt, parseSize, url2Base64, preferRatioOverDefaultSize } from '../utils/utils.js'
import { translate } from '../utils/translate.js'
import { runDraw, sendResult, makeTicker, queueStatusText } from '../utils/draw.js'
import { lastDrawKey, saveLast } from '../utils/lastDraw.js'

/** 图生图/改图 的命令头，取提示词时要剥掉 */
const IMG_HEADS = ['图生图', '改图']

export class Text2img extends plugin {
  constructor() {
    super({
      /** 功能名称 */
      name: 'ComfyUI-绘图',
      /** 功能描述 */
      dsc: '绘画',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 1009,
      rule: [
        {
          /** 文生图：绘图 / 咏唱 / draw / 画画
           *  末尾加了否定前瞻：把「#绘图帮助」「#绘图白名单」这类指令留给对应的插件，
           *  避免同一条消息既出图又干别的（不靠优先级，双保险）。
           *  注意「白名单」用的是紧贴判断（(?!白名单)），这样 #绘图 白名单 这种
           *  "真的想画白名单" 的写法还画得出来。*/
          reg: '^#?(绘图|咏唱|draw|画画)(?!\\s*(帮助|help|菜单|说明|指令)\\s*$)(?!白名单)([\\s\\S]*)$',
          fnc: 'text2img',
          dsc: '文生图：发提示词即可，支持 --size/--steps/--seed 等参数'
        },
        {
          /** 图生图：引用一张图 + 图生图/改图（同样避开「#图生图帮助」）*/
          reg: '^#?(图生图|改图)(?!\\s*(帮助|help|菜单|说明|指令)\\s*$)([\\s\\S]*)$',
          fnc: 'img2img',
          dsc: '图生图/改图：引用一张图片再发指令'
        }
      ]
    })
  }

  /** 收集本次绘图参数：默认参数 + 命令里 --k v */
  async _collect(e) {
    const config = (await Config.getConfig()) || {}
    const parsed = await parseCommandString(e.msg)
    const params = { ...(Config.getDefDrawParams() || {}), ...parsed }

    // 尺寸：支持 --size 1024x1024
    const size = parseSize(parsed.size)
    if (size) {
      params.width = size.width
      params.height = size.height
    }
    delete params.size

    // 只写了 --ratio 的话，别让默认参数里的 width/height 把比例顶掉
    preferRatioOverDefaultSize(params, parsed)

    // 提示词：命令里带的正文 + --prompt（后者优先）
    if (!params.prompt) params.prompt = extractPrompt(e.msg)
    params.prompt = await translate(params.prompt)

    return { config, params }
  }

  /** 出图成功后记一笔，供 #重绘 复用 */
  _remember(e, params, { raw, workflow, applied } = {}) {
    try {
      saveLast(lastDrawKey(e), {
        who: e.sender?.card || e.sender?.nickname || '',
        userId: e.user_id,
        raw: raw || '',
        applied: applied || null,
        params: { ...params, ...(workflow ? { workflow } : {}) }
      })
    } catch (err) {
      console.error('[COMFYUI-PLUGIN] 记录上次绘图失败', err?.message)
    }
  }

  async text2img(e) {
    const { config, params } = await this._collect(e)
    if (!params.prompt) {
      await e.reply('请带上提示词，例如：\n#绘图 一只戴帽子的猫 --steps 8 --size 1024x1024')
      return true
    }

    // 提示不在这里发：等提交被接受后由 runDraw 发，那时才能带上真实队列数
    const r = await runDraw(e, params, config)
    if (r.ok) this._remember(e, params, { raw: extractPrompt(e.msg), workflow: r.workflow, applied: r.parameters })
    return true
  }

  async img2img(e) {
    const { config, params } = await this._collect(e)

    // 取引用消息/本条消息里的图片
    const url = e.img?.[0] || e.message?.find?.((m) => m.type === 'image')?.url
    if (!url) {
      await e.reply('请引用一张图片再发送，例如：\n（引用图片）#改图 把背景换成雪天')
      return true
    }

    const b64 = await url2Base64(url)
    if (!b64) {
      await e.reply('图片下载失败了，换一张试试')
      return true
    }

    const started = Date.now()
    // 提交被接受后回调里发提示（带队列数）
    const onSubmit = async (info) => {
      await e.reply(`图片已收到，已提交给 ComfyUI…${queueStatusText(info?.queue)}`, true)
    }
    const result = await Code.img2img(params, Buffer.from(b64, 'base64'), makeTicker(e, config), onSubmit)
    const elapsed = (Date.now() - started) / 1000

    if (!result.status) {
      await e.reply(result.msg)
      return true
    }

    await sendResult(e, result, config, elapsed)
    this._remember(e, params, {
      raw: extractPrompt(e.msg, IMG_HEADS),
      workflow: result.data?.workflow,
      applied: result.data?.parameters
    })
    return true
  }
}
