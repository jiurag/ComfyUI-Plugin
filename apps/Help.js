import { ComfyPlugin as plugin } from '../utils/base.js'
import Config from '../components/Config.js'
import { replyCard } from '../utils/render.js'
import { replyParamsMode } from '../utils/draw.js'

export class Help extends plugin {
  constructor() {
    super({
      name: 'ComfyUI-帮助',
      dsc: 'ComfyUI 插件的帮助菜单',
      event: 'message',
      priority: 1008,
      rule: [
        {
          reg: '^#?(绘画|绘图|画画|咏唱|draw|comfyui|comfy)(帮助|help|菜单|说明|指令)$',
          fnc: 'showHelp',
          dsc: '查看 ComfyUI 插件帮助'
        }
      ]
    })
  }

  async showHelp(e) {
    const config = Config.getConfig() || {}
    const workflows = Config.listWorkflows()
    const draw = Config.getDefDrawParams() || {}
    const apis = (config.api_list || [])
      .filter((x) => x && String(x.baseurl || '').trim())
      .map((x) => x.baseurl)
      .join('  、  ') || '（还没配置）'

    const drawKeys = Object.keys(draw)
    const drawText = drawKeys.length
      ? drawKeys.map((k) => `${k}=${draw[k]}`).join('  ')
      : '（空，用工作流里的默认值）'

    const sections = [
      {
        title: '最常用',
        items: [
          { c: '#绘图 一只戴帽子的猫', d: '文生图（#画画 / #draw / #咏唱 都可以）' },
          { c: '（引用图片）#改图 换成雪天', d: '图生图 / 参考图改图' },
          { c: '#重绘', d: '复用上次的提示词和参数再画一张（种子会重新随机）' },
          { c: '#重绘 --steps 12', d: '复用上次的，只临时改几个参数' },
          { c: '#上次提示词', d: '看看上次画的是什么提示词' }
        ]
      },
      {
        title: '可选参数（跟在提示词后面）',
        items: [
          { c: '--size 1024x1024', d: '宽 x 高；也可 --width 832 --height 1216' },
          { c: '--ratio 16:9', d: '画面比例：1:1 / 16:9 / 9:16 / 21:9 / 4:3 / 3:4 / 3:2 / 2:3' },
          { c: '--megapixels 1', d: '画面总像素（配合 --ratio；越大越清晰也越慢）' },
          { c: '--seconds 5', d: '视频时长（秒），视频工作流才用得上；帧数由插件按模型自动对齐' },
          { c: '--steps 8  --cfg 1', d: '步数 / CFG（不写就用默认参数或工作流的值）' },
          { c: '--seed 12345', d: '指定随机种子，不写就随机' },
          { c: '--denoise 0.6', d: '图生图重绘幅度' },
          { c: '--batch_size 2', d: '一次出几张' },
          { c: '--model 文件名.safetensors', d: '换底模' },
          { c: '--lora "名字.safetensors"', d: '换 LoRA（可配 --lora_strength 0.8）' },
          { c: '--workflow z-image-turbo', d: '这一次临时换个工作流' }
        ]
      },
      {
        title: '默认参数 / 工作流',
        items: [
          { c: '#添加默认参数 --steps 8', d: '追加默认参数（不带参数出图时生效）' },
          { c: '#删除默认参数 --steps', d: '删掉某项默认参数' },
          { c: '#查看默认参数', d: '查看当前默认参数' },
          { c: '#工作流列表', d: '看有哪些工作流、当前用的是哪个' },
          { c: '#用工作流 名字', d: '切换默认工作流（仅主人）' },
          { c: '#出图参数 完整 / 耗时 / 关闭', d: '出图后附完整参数卡片 / 只报耗时 / 什么都不发（仅主人）' }
        ]
      },
      {
        title: '任务管理',
        items: [
          { c: '#绘画队列', d: '看排队情况（运行中 / 排队中）' },
          { c: '#取消绘画', d: '中断当前任务（仅主人）' },
          { c: '#模型列表 / #lora列表', d: '查可用的底模和 LoRA' }
        ]
      },
      {
        title: '谁能用（仅主人可改）',
        items: [
          { c: '#绘图白名单', d: '看允许使用的群 / 私聊名单，以及开关状态' },
          { c: '#开启绘图白名单 / #关闭绘图白名单', d: '开了以后只有名单里的人能用' },
          { c: '#添加绘图白名单 本群', d: '把当前群加进白名单（也支持 群 123456 / @某人）' },
          { c: '#删除绘图白名单 群 123456', d: '从白名单里移除' }
        ]
      }
    ]

    const configRows = [
      { k: 'ComfyUI 地址', v: apis },
      { k: '默认工作流', v: config.workflow || '未设置' },
      { k: '可用工作流', v: workflows.join('、') || '（空，把 API 格式 json 放进 config/workflows/）' },
      { k: '默认参数', v: drawText },
      {
        k: '参数回执',
        v: {
          full: '完整参数卡片（含耗时）',
          time: '只报耗时（秒）',
          none: '关闭'
        }[replyParamsMode(config)]
      },
      { k: '进度提醒', v: Number(config.notify_interval) ? `每 ${config.notify_interval} 秒报一次` : '不打扰' }
    ]

    await replyCard(e, {
      title: 'ComfyUI 绘图',
      subtitle: `命令一览 · 当前工作流 ${config.workflow || '未设置'}`,
      sections,
      config: configRows
    }, 'ComfyUI 绘图插件 · 帮助')
    return true
  }
}
