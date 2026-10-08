import Config from '../components/Config.js'

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

export function setWhitelist(patch) {
  const cfg = Config.getConfig() || {}
  cfg.whitelist = { ...(cfg.whitelist || {}), ...patch }
  return Config.setConfig(cfg)
}

export function inList(list, id) {
  const target = String(id ?? '').trim()
  if (!target) return false
  return normalizeList(list).includes(target)
}

export function checkAccess(e) {
  const wl = getWhitelist()
  const isGroup = Boolean(e?.group_id)
  const id = String((isGroup ? e.group_id : e.user_id) ?? '')

  if (!wl.enable) return { allowed: true, scope: isGroup ? 'group' : 'user', id }
  if (e?.isMaster) return { allowed: true, scope: isGroup ? 'group' : 'user', id }

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
