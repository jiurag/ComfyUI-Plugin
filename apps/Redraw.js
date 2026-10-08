import { ComfyPlugin as plugin } from '../utils/base.js'
import Config from '../components/Config.js'
import { parseCommandString, parseSize, extractPrompt, preferRatioOverDefaultSize } from '../utils/utils.js'
import { translate } from '../utils/translate.js'
import { runDraw } from '../utils/draw.js'
import { replyCard } from '../utils/render.js'
import { lastDrawKey, getLast, saveLast, clearLast, lastDrawRows } from '../utils/lastDraw.js'

const HEADS = ['重绘', '再画一张', '再来一张', 'redraw']

export class Redraw extends plugin {
  constructor() {
    super({
      name: 'ComfyUI-重绘',
      dsc: '复用上次的提示词再画一张',
      event: 'message',
      priority: 1009,
      rule: [
        {
          reg: '^#?(重绘|再画一张|再来一张|redraw)(\\s+[\\s\\S]*)?$',
          fnc: 'redraw',
          dsc: '用上次的提示词/参数再画一张，可另外追加 --参数 临时覆盖'
        },
        {
          reg: '^#?(上次提示词|查看上次绘图|上次画了什么)$',
          fnc: 'showLast',
          dsc: '看看上次这张用的是什么提示词'
        },
        {
          reg: '^#?忘记上次绘图$',
          fnc: 'forgetLast',
          dsc: '清掉本群/本人的上次绘图记录'
        }
      ]
    })
  }

  async redraw(e) {
    const key = lastDrawKey(e)
    const last = getLast(key)
    if (!last) {
      await e.reply('这里还没有画过图哦～\n先用 #绘图 提示词 画一张，之后就能用 #重绘 再来了')
      return true
    }

    const config = (await Config.getConfig()) || {}
    const parsed = await parseCommandString(e.msg)

    const params = { ...last.params }
    for (const [k, v] of Object.entries(parsed)) {
      if (k === 'size') continue
      params[k] = v
    }
    const size = parseSize(parsed.size)
    if (size) {
      params.width = size.width
      params.height = size.height
    }
    delete params.size
    preferRatioOverDefaultSize(params, parsed)

    const inline = extractPrompt(e.msg, HEADS)
    if (inline) params.prompt = await translate(inline)

    if (parsed.seed === undefined) delete params.seed

    if (!params.prompt) {
      await e.reply('上次那条没留下提示词，重新用 #绘图 画一张吧')
      return true
    }

    await e.reply(
      `重绘中：复用${last.who ? ` ${last.who} ` : ''}上次的提示词` +
        `${Object.keys(parsed).filter((k) => k !== 'size').length ? `（另外改了 ${Object.keys(parsed).filter((k) => k !== 'size').map((k) => '--' + k).join(' ')}）` : ''}` +
        '，正在生成…',
      true
    )

    const r = await runDraw(e, params, config)
    if (r.ok) {
      saveLast(key, {
        who: last.who,
        userId: last.userId,
        raw: inline || last.raw,
        applied: r.parameters,
        params: { ...params, ...(r.workflow ? { workflow: r.workflow } : {}) }
      })
    }
    return true
  }

  async showLast(e) {
    const last = getLast(lastDrawKey(e))
    if (!last) {
      await e.reply('这里还没有画过图哦～先用 #绘图 画一张吧')
      return true
    }
    await replyCard(e, {
      title: '上次画的这张',
      subtitle: '发 #重绘 就能照这个再来一张',
      sections: [],
      config: lastDrawRows(last, [
        { k: '再来一张', v: '#重绘' },
        { k: '改点参数', v: '#重绘 --steps 12 --size 832x1216' },
        { k: '只换提示词', v: '#重绘 换成雪天' }
      ]),
      configTitle: '上次的提示词与参数'
    }, '上次的提示词')
    return true
  }

  async forgetLast(e) {
    const key = lastDrawKey(e)
    const had = clearLast(key)
    await e.reply(had ? '好的，已经忘掉上次的绘图记录了' : '本来就没有记录哦')
    return true
  }
}
