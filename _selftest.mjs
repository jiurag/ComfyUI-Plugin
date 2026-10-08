import fs from 'node:fs'
import './model/init.js'
import Config from './components/Config.js'
import Core from './components/Core.js'
import { pluginRoot } from './model/path.js'

const argv = process.argv.slice(2)
const imgFlag = argv.indexOf('--image')
const imagePath = imgFlag >= 0 ? argv[imgFlag + 1] : null
const rest = imgFlag >= 0 ? argv.filter((a, i) => i !== imgFlag && i !== imgFlag + 1) : argv

const prompt = rest[0] || 'a cute cat sitting on a windowsill, soft sunlight, ultra detailed'
const workflow = rest[1]

const config = Config.getConfig()
console.log('配置：', JSON.stringify({
  baseurl: config?.api_list?.[0]?.baseurl,
  workflow: workflow || config?.workflow,
  timeout: config?.timeout
}, null, 2))

const params = { prompt, ...(workflow ? { workflow } : {}) }

const started = Date.now()
console.log(`\n模式：${imagePath ? '图生图（会上传本地图片）' : '文生图'}`)
console.log('提交中…（第一次跑某个模型会比较慢，因为要加载权重）')

const onTick = (sec, remain) => {
  console.log(`  ...已用 ${sec} 秒${remain !== null && remain !== undefined ? `，队列剩余 ${remain}` : ''}`)
}

const res = imagePath
  ? await Core.img2img(params, fs.readFileSync(imagePath), onTick)
  : await Core.text2img(params, onTick)

if (!res.status) {
  console.error('\n❌ 失败：', res.msg)
  process.exit(1)
}

console.log(`\n✅ 成功，用时 ${((Date.now() - started) / 1000).toFixed(1)} 秒`)
console.log('注入的参数：', JSON.stringify(res.data.parameters, null, 2))

for (const file of res.data.files) {
  const out = `${pluginRoot}/resources/tmp/selftest_${Date.now()}_${file.filename}`
  fs.writeFileSync(out, Buffer.from(file.base64, 'base64'))
  console.log(`图片已保存：${out}（${(fs.statSync(out).size / 1024).toFixed(0)} KB）`)
}
