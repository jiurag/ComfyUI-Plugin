/**
 * 使用白名单：只有名单里的群 / 人能用这个插件
 *
 * 设计上尽量"不容易把自己锁在外面"：
 *   - enable 为 false（默认）时不做任何限制，行为和以前完全一样
 *   - 机器人主人始终放行，哪怕一个名单都没配
 *   - 群聊只看 groups，私聊只看 users，互不干扰
 */

import Config from '../components/Config.js'

/** 名单里可能有空格、逗号、顿号、换行，统一拆成干净的数字串数组 */
export function normalizeList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(/[\s,，、;；\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/** 读当前白名单设置（带默认值） */
export function getWhitelist() {
  const cfg = Config.getConfig() || {}
  const wl = cfg.whitelist || {}
  return {
    enable: wl.enable === true,
    groups: normalizeList(wl.groups),
    users: normalizeList(wl.users),
    reply: wl.reply !== false
  }
}

/** 改白名单设置（只改传进来的字段） */
export function setWhitelist(patch) {
  const cfg = Config.getConfig() || {}
  cfg.whitelist = { ...(cfg.whitelist || {}), ...patch }
  return Config.setConfig(cfg)
}

/** 某个 id 在不在名单里 */
export function inList(list, id) {
  const target = String(id ?? '').trim()
  if (!target) return false
  return normalizeList(list).includes(target)
}

/**
 * 判断这条消息能不能用插件
 * @returns {{allowed: boolean, reply?: string, scope?: string, id?: string}}
 */
export function checkAccess(e) {
  const wl = getWhitelist()
  const isGroup = Boolean(e?.group_id)
  const id = String((isGroup ? e.group_id : e.user_id) ?? '')

  if (!wl.enable) return { allowed: true, scope: isGroup ? 'group' : 'user', id }
  if (e?.isMaster) return { allowed: true, scope: isGroup ? 'group' : 'user', id } // 主人始终放行

  const list = isGroup ? wl.groups : wl.users
  if (inList(list, id)) return { allowed: true, scope: isGroup ? 'group' : 'user', id }

  return {
    allowed: false,
    scope: isGroup ? 'group' : 'user',
    id,
    reply: wl.reply
      ? isGroup
        ? `本群（${id}）还没开通绘图功能，要开通请联系管理员`
        : '你还没开通绘图功能，要开通请联系管理员'
      : ''
  }
}
