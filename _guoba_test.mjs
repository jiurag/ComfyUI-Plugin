import './model/init.js'
import Config from './components/Config.js'
import { supportGuoba } from './guoba.support.js'

const guoba = supportGuoba()
const { schemas, getConfigData, setConfigData } = guoba.configInfo

console.log('插件信息：', guoba.pluginInfo.title, '/', guoba.pluginInfo.name)
console.log('配置项数量：', schemas.length)
console.log('分组：', schemas.filter((s) => s.component === 'SOFT_GROUP_BEGIN').map((s) => s.label).join(' | '))

let data = getConfigData()
console.log('\n[打开页面] api_list =', JSON.stringify(data.api_list))
console.log('[打开页面] workflow =', data.workflow)

const Result = {
  ok: (d, msg) => ({ ok: msg }),
  error: (d, msg) => ({ error: msg })
}

const form = {
  'api_list.0.baseurl': 'http://127.0.0.1:8188',
  'api_list.0.username': '',
  'api_list.0.password': '',
  'api_list.1.baseurl': '',
  'api_list.1.username': '',
  'api_list.1.password': '',
  use_api: 0,
  workflow: 'z-image-turbo',
  poll_interval: 2,
  timeout: 900,
  notify_interval: 60,
  reply_params: true,
  'draw.negative_prompt': 'bad hands, low quality',
  'draw.steps': 8,
  'draw.cfg': 1,
  'draw.width': 1024,
  'draw.height': 1024,
  'draw.batch_size': 1,
  'draw.denoise': '',
  'draw.sampler_name': '',
  'draw.scheduler': '',
  'draw.model': '',
  'draw.lora': '',
  'draw.lora_strength': '',
  'node_map.positive': '',
  'node_map.negative': '',
  'node_map.sampler': '',
  'node_map.latent': '',
  'node_map.model': '',
  'node_map.lora': '',
  'node_map.image': '',
  'translate.appid': '',
  'translate.appkey': '',
  'nsfw_check.enable': false,
  'nsfw_check.url': '',
  'nsfw_check.apikey': ''
}

const saveResult = setConfigData(form, { Result })
console.log('\n[点保存] 返回：', JSON.stringify(saveResult))

const savedConfig = Config.getConfig()
const savedDraw = Config.getDefDrawParams()
console.log('\n[落盘 config.yaml]')
console.log('  api_list =', JSON.stringify(savedConfig.api_list))
console.log('  workflow =', savedConfig.workflow, '｜ timeout =', savedConfig.timeout)
console.log('[落盘 def_draw_params.yaml]')
console.log(' ', JSON.stringify(savedDraw))

const roundTrip = getConfigData()
console.log('\n[再次打开页面] api_list =', JSON.stringify(roundTrip.api_list))
console.log('[再次打开页面] draw =', JSON.stringify(roundTrip.draw))

const pass =
  Array.isArray(savedConfig.api_list) &&
  savedConfig.api_list.length === 1 &&
  savedConfig.api_list[0].baseurl === 'http://127.0.0.1:8188' &&
  savedDraw.steps === 8 &&
  savedDraw.negative_prompt === 'bad hands, low quality' &&
  savedDraw.denoise === undefined

console.log(pass ? '\n✅ 锅巴适配自检通过' : '\n❌ 结果不符合预期，检查 guoba.support.js')
process.exit(pass ? 0 : 1)
