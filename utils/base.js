/**
 * 插件基类：在构造函数里给**每一条命令**套一层白名单检查。
 *
 * 为什么这么做：白名单要挡住的是"所有指令"，如果在十几个 fnc 里各抄一遍
 * if 判断，以后加命令很容易漏。这里只写一次：把 rule 里的 fnc 名字换成
 * 一个包过的同名方法，加载器照常按名字调用，检查就自动生效了。
 *
 * 顺带说明为什么不改写 rule.reg：命令仍然要能被匹配到，
 * 拦截时才能回一句"未开通"，不然用户只会觉得机器人根本没反应。
 *
 * 拦截时**返回 false**（而不是 true）：加载器那边 `res === false` 表示
 * "这条消息我不处理"，它会接着看本插件后面的规则、以及别的插件。
 * 如果返回 true，加载器会直接结束整次消息派发 —— 那样连别的插件也不会回话了。
 */

import plugin from '../../../lib/plugins/plugin.js'
import { checkAccess } from './whitelist.js'

export class ComfyPlugin extends plugin {
  constructor(opt) {
    super(opt)

    for (const rule of this.rule || []) {
      if (!rule || typeof rule.fnc !== 'string') continue
      if (rule.__guarded) continue
      const original = rule.fnc
      if (typeof this[original] !== 'function') continue

      const wrapped = `__guard_${original}`
      if (typeof this[wrapped] !== 'function') {
        this[wrapped] = async (e) => {
          const res = checkAccess(e)
          if (!res.allowed) {
            if (res.reply) await e.reply(res.reply)
            // 关键：返回 false = 这条消息我不管了，别的插件照常处理
            return false
          }
          return this[original](e)
        }
      }
      rule.fnc = wrapped
      rule.__guarded = true
    }
  }
}
