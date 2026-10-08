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
