import lodash from 'lodash'
import Config from './components/Config.js'

const MAX_API_SLOTS = 2 

function replyParamsModeOf(config) {
  const raw = config?.reply_params
  if (raw === false || raw === 'none' || raw === 'false' || raw === 'off') return 'none'
  if (raw === 'time') return 'time'
  return 'full'
}

function apiSchemaFields() {
  const out = []
  for (let i = 1; i <= MAX_API_SLOTS; i++) {
    const no = i === 1 ? '①' : '②'
    const spare = i === 1 ? '' : '（备用，可留空）'
    out.push(
      {
        field: `api_${i}_baseurl`,
        label: `${no} 接口地址${spare}`,
        bottomHelpMessage: i === 1
          ? '例：http://127.0.0.1:8188（同机）或 http://192.168.1.5:8188（局域网）或隧道地址'
          : '配多个地址时，use_api=0 会随机挑一个',
        component: 'Input',
        required: i === 1,
        componentProps: { placeholder: i === 1 ? 'http://127.0.0.1:8188' : '不用就留空' }
      },
      {
        field: `api_${i}_username`,
        label: `${no} 账号`,
        bottomHelpMessage: i === 1 ? 'ComfyUI 前面挂了认证（比如隧道闸门）才需要填' : undefined,
        component: 'Input',
        componentProps: { placeholder: i === 1 ? '没有认证就留空' : '可留空' }
      },
      {
        field: `api_${i}_password`,
        label: `${no} 密码`,
        component: 'InputPassword',
        componentProps: { placeholder: i === 1 ? '没有认证就留空' : '可留空' }
      }
    )
  }
  return out
}

const RATIO_OPTIONS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'].map((r) => ({ label: r, value: r }))

const DRAW_FIELDS = [
  { key: 'negative_prompt', label: '默认负向提示词', component: 'InputTextArea', help: '群里 #绘图 没写 --negative 时用它' },
  { key: 'steps', label: '默认步数', component: 'InputNumber', props: { min: 1, max: 150 } },
  { key: 'cfg', label: '默认 CFG', component: 'InputNumber', props: { min: 0, max: 30, step: 0.1 } },
  { key: 'width', label: '默认宽度', component: 'InputNumber', props: { min: 64, max: 4096, step: 64 } },
  { key: 'height', label: '默认高度', component: 'InputNumber', props: { min: 64, max: 4096, step: 64 } },
  {
    key: 'ratio',
    label: '默认画面比例',
    component: 'Select',
    props: { options: [{ label: '不设置（用工作流自带的）', value: '' }, ...RATIO_OPTIONS] },
    help: '设了就按比例出图（会盖过上面的默认宽高）；群里临时改：--ratio 16:9，想恢复就选回「不设置」'
  },
  {
    key: 'megapixels',
    label: '默认总像素（MP）',
    component: 'InputNumber',
    props: { min: 0.1, max: 16, step: 0.1 },
    help: '配合画面比例用，1 ≈ 1024x1024 的像素量；留空 = 用工作流自带的大小'
  },
  { key: 'batch_size', label: '默认张数', component: 'InputNumber', props: { min: 1, max: 8 } },
  { key: 'denoise', label: '默认重绘幅度', component: 'InputNumber', props: { min: 0, max: 1, step: 0.05 }, help: '图生图用' },
  { key: 'sampler_name', label: '默认采样器', component: 'Input', help: '留空就用工作流里原本的设置' },
  { key: 'scheduler', label: '默认调度器', component: 'Input' },
  { key: 'model', label: '默认底模', component: 'Input', help: '填 ComfyUI 里的文件名，留空就用工作流里的' },
  { key: 'lora', label: '默认 LoRA', component: 'Input' },
  { key: 'lora_strength', label: '默认 LoRA 强度', component: 'InputNumber', props: { min: 0, max: 2, step: 0.05 } }
]

export function supportGuoba() {
  const workflows = Config.listWorkflows()

  const schemas = [
    { label: 'ComfyUI 接口', component: 'SOFT_GROUP_BEGIN' },
    ...apiSchemaFields(),
    {
      field: 'use_api',
      label: '用第几个接口',
      bottomHelpMessage: '0 = 随机挑一个；1 = 永远用 ①；2 = 永远用 ②',
      component: 'InputNumber',
      componentProps: { min: 0, max: MAX_API_SLOTS }
    },

    { label: '工作流与运行', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'workflow',
      label: '默认工作流',
      bottomHelpMessage: '对应 config/workflows/<名字>.json，就是 ComfyUI 里「导出(API)」得到的文件',
      component: workflows.length ? 'Select' : 'Input',
      componentProps: workflows.length
        ? { options: workflows.map((n) => ({ label: n, value: n })) }
        : { placeholder: '还没有工作流文件，先往 config/workflows/ 里放 json' }
    },
    {
      field: 'poll_interval',
      label: '查询间隔（秒）',
      bottomHelpMessage: '多久查一次是否出图，默认 2',
      component: 'InputNumber',
      componentProps: { min: 1, max: 30 }
    },
    {
      field: 'timeout',
      label: '超时（秒）',
      bottomHelpMessage: '超过这个时间还没出图就放弃，默认 900',
      component: 'InputNumber',
      componentProps: { min: 60, max: 7200 }
    },
    {
      field: 'notify_interval',
      label: '进度提醒间隔（秒）',
      bottomHelpMessage: '生成过程中每隔多久在群里说一句“还在生成”，0 = 不打扰',
      component: 'InputNumber',
      componentProps: { min: 0, max: 600 }
    },
    {
      field: 'reply_params',
      label: '出图后的参数回执',
      bottomHelpMessage:
        '完整＝附一张参数卡片（提示词、种子、步数、耗时）；只报耗时＝回一句「出图完成，耗时 X 秒」；关闭＝什么都不发。' +
        '群里也能改：#出图参数 完整 / 耗时 / 关闭',
      component: 'Select',
      componentProps: {
        options: [
          { label: '完整参数卡片（含耗时）', value: 'full' },
          { label: '只报耗时（秒）', value: 'time' },
          { label: '关闭', value: 'none' }
        ]
      }
    },

    { label: '默认绘图参数（群里不写参数时用）', component: 'SOFT_GROUP_BEGIN' },
    ...DRAW_FIELDS.map((f) => ({
      field: `draw.${f.key}`,
      label: f.label,
      bottomHelpMessage: f.help,
      component: f.component,
      componentProps: f.props || {}
    })),

    { label: '高级：节点定位（认不出工作流节点时才填）', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'node_map.positive',
      label: '正向提示词节点 id',
      bottomHelpMessage: '留空即可。插件会顺着 KSampler 的 positive 连线自己找',
      component: 'Input',
      componentProps: { placeholder: '留空' }
    },
    { field: 'node_map.negative', label: '负向提示词节点 id', component: 'Input', componentProps: { placeholder: '留空' } },
    { field: 'node_map.sampler', label: '采样器节点 id', component: 'Input', componentProps: { placeholder: '留空' } },
    { field: 'node_map.latent', label: '画布（尺寸）节点 id', component: 'Input', componentProps: { placeholder: '留空' } },
    { field: 'node_map.model', label: '底模节点 id', component: 'Input', componentProps: { placeholder: '留空' } },
    { field: 'node_map.lora', label: 'LoRA 节点 id', component: 'Input', componentProps: { placeholder: '留空' } },
    { field: 'node_map.image', label: '输入图片节点 id', component: 'Input', componentProps: { placeholder: '留空' } },

    { label: '翻译与内容审核（可选）', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'translate.appid',
      label: '百度翻译 APPID',
      bottomHelpMessage: '填了会把中文提示词自动翻成英文；不填就原样使用',
      component: 'Input',
      componentProps: { placeholder: '可留空' }
    },
    { field: 'translate.appkey', label: '百度翻译密钥', component: 'InputPassword', componentProps: { placeholder: '可留空' } },
    {
      field: 'nsfw_check.enable',
      label: '开启出图审核',
      bottomHelpMessage: '默认关闭。开启后出图前会先把图片发给下面的地址检查',
      component: 'Switch'
    },
    { field: 'nsfw_check.url', label: '审核接口地址', component: 'Input', componentProps: { placeholder: 'https://...' } },
    { field: 'nsfw_check.apikey', label: '审核接口密钥', component: 'InputPassword', componentProps: { placeholder: '可留空' } },

    { label: '使用白名单', component: 'SOFT_GROUP_BEGIN' },
    {
      field: 'whitelist.enable',
      label: '只允许白名单使用',
      bottomHelpMessage: '开启后，只有下面名单里的群 / 人能用绘图功能；机器人主人始终放行',
      component: 'Switch'
    },
    {
      field: 'wl_groups',
      label: '允许使用的群号',
      bottomHelpMessage: '一行一个群号。群聊里发 #添加绘图白名单 本群 也能加',
      component: 'InputTextArea',
      componentProps: { placeholder: '123456789\n987654321', rows: 3 }
    },
    {
      field: 'wl_users',
      label: '允许私聊的 QQ',
      bottomHelpMessage: '一行一个 QQ 号。群里 @某人 再发 #添加绘图白名单 @某人 也能加',
      component: 'InputTextArea',
      componentProps: { placeholder: '123456789', rows: 3 }
    },
    {
      field: 'whitelist.reply',
      label: '被拦下时回一句提示',
      bottomHelpMessage: '默认关闭＝完全不理（安静）。想看到底哪个群被拦、顺便拿群号复制去加名单，就打开它',
      component: 'Switch'
    }
  ]

  return {
    pluginInfo: {
      name: 'comfyui-plugin',
      title: 'ComfyUI 绘图',
      author: ['@jiurag'],
      authorLink: ['https://github.com/jiurag'],
      link: 'https://github.com/jiurag/ComfyUI-Plugin',
      isV3: true,
      isV2: false,
      showInMenu: true,
      description: '基于 Yunzai 的绘图插件，走 ComfyUI 工作流接口（文生图 / 图生图 / 视频）',
      icon: 'mdi:palette-swatch-variant',
      iconColor: '#4ade80'
    },
    configInfo: {
      schemas,

      getConfigData() {
        const config = lodash.cloneDeep(Config.getConfig() || {})

        const apiList = Array.isArray(config.api_list) ? config.api_list : []
        delete config.api_list
        for (let i = 0; i < MAX_API_SLOTS; i++) {
          const slot = apiList[i] || {}
          const no = i + 1
          config[`api_${no}_baseurl`] = slot.baseurl || ''
          config[`api_${no}_username`] = slot.username || ''
          config[`api_${no}_password`] = slot.password || ''
        }

        config.node_map = config.node_map || {}

        config.reply_params = replyParamsModeOf(config)

        const wl = config.whitelist || {}
        config.wl_groups = (Array.isArray(wl.groups) ? wl.groups : []).join('\n')
        config.wl_users = (Array.isArray(wl.users) ? wl.users : []).join('\n')
        delete config.whitelist
        config.whitelist = { enable: wl.enable === true, reply: wl.reply !== false }

        const draw = Config.getDefDrawParams() || {}
        config.draw = {}
        for (const f of DRAW_FIELDS) {
          if (draw[f.key] !== undefined) config.draw[f.key] = draw[f.key]
        }
        return config
      },

      setConfigData(data, { Result }) {
        const patch = {}
        const drawPatch = {}
        const apiPatch = {}
        let wlGroups = null
        let wlUsers = null

        for (const [keyPath, value] of Object.entries(data)) {
          const apiMatch = /^api_(\d+)_(baseurl|username|password)$/.exec(keyPath)
          if (apiMatch) {
            apiPatch[apiMatch[1]] = apiPatch[apiMatch[1]] || {}
            apiPatch[apiMatch[1]][apiMatch[2]] = value
          } else if (keyPath === 'wl_groups') {
            wlGroups = value
          } else if (keyPath === 'wl_users') {
            wlUsers = value
          } else if (keyPath.startsWith('draw.')) {
            drawPatch[keyPath.slice(5)] = value
          } else {
            lodash.set(patch, keyPath, value)
          }
        }

        const config = lodash.merge({}, Config.getConfig() || {}, patch)
        if (Object.keys(apiPatch).length) {
          const slots = []
          for (let i = 1; i <= MAX_API_SLOTS; i++) {
            const s = apiPatch[i]
            if (!s) continue
            slots.push({
              baseurl: String(s.baseurl || '').trim(),
              username: String(s.username || ''),
              password: String(s.password || '')
            })
          }
          config.api_list = slots.filter((s) => s.baseurl)
        }
        if (!Array.isArray(config.api_list) || !config.api_list.length) {
          config.api_list = [{ baseurl: '', username: '', password: '' }]
        }

        const splitIds = (v) =>
          String(v ?? '')
            .split(/[\s,，、;；]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        config.whitelist = config.whitelist || {}
        if (wlGroups !== null) config.whitelist.groups = splitIds(wlGroups)
        if (wlUsers !== null) config.whitelist.users = splitIds(wlUsers)

        if (!Config.setConfig(config)) return Result.error({}, '写入 config.yaml 失败，检查插件目录权限')

        const draw = Config.getDefDrawParams() || {}
        for (const [key, value] of Object.entries(drawPatch)) {
          if (value === '' || value === null || value === undefined) delete draw[key]
          else draw[key] = value
        }
        if (!Config.setDefDrawParams(draw)) return Result.error({}, '写入 def_draw_params.yaml 失败')

        return Result.ok({}, '保存成功~')
      }
    }
  }
}
