import { ComfyPlugin as plugin } from '../utils/base.js'
import Config from '../components/Config.js'
import Code from '../components/Core.js'
import { parseCommandString, extractPrompt, parseSize, url2Base64, preferRatioOverDefaultSize } from '../utils/utils.js'
import { translate } from '../utils/translate.js'
import { runDraw, sendResult, makeTicker, submitText } from '../utils/draw.js'
import { lastDrawKey, saveLast } from '../utils/lastDraw.js'

const IMG_HEADS = ['图生图', '改图']

export class Text2img extends plugin {
  constructor() {
    super({
      name: 'ComfyUI-绘图',
      dsc: '绘画',
      event: 'message',
      priority: 1009,
      rule: [
        {
          reg: '^#?(绘图|咏唱|draw|画画)(?!\\s*(帮助|help|菜单|说明|指令)\\s*$)(?!白名单)([\\s\\S]*)$',
          fnc: 'text2img',
          dsc: '文生图：发提示词即可，支持 --size/--steps/--seed 等参数'
        },
        {
          reg: '^#?(图生图|改图)(?!\\s*(帮助|help|菜单|说明|指令)\\s*$)([\\s\\S]*)$',
          fnc: 'img2img',
          dsc: '图生图/改图：引用一张图片再发指令'
        }
      ]
    })
  }

  async _collect(e) {
    const config = (await Config.getConfig()) || {}
    const parsed = await parseCommandString(e.msg)
    const params = { ...(Config.getDefDrawParams() || {}), ...parsed }

    const size = parseSize(parsed.size)
    if (size) {
      params.width = size.width
      params.height = size.height
    }
    delete params.size

    preferRatioOverDefaultSize(params, parsed)

    if (!params.prompt) params.prompt = extractPrompt(e.msg)
    params.prompt = await translate(params.prompt)

    return { config, params }
  }

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

    const r = await runDraw(e, params, config)
    if (r.ok) this._remember(e, params, { raw: extractPrompt(e.msg), workflow: r.workflow, applied: r.parameters })
    return true
  }

  async img2img(e) {
    const { config, params } = await this._collect(e)

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
    const onSubmit = async (info) => {
      await e.reply(submitText(info?.queue, '图片已收到'), true)
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
