import fs from 'node:fs'
import Config from '../components/Config.js'
import { pluginRoot } from './path.js'

class Init {
  constructor() {
    this.initConfig()
  }

  initConfig() {
    const configDefaultPath = `${pluginRoot}/config/config_default.yaml`
    if (!fs.existsSync(configDefaultPath)) {
      console.error('[COMFYUI-PLUGIN] 默认设置文件不存在，请检查或重新安装插件')
      return true
    }

    const configPath = `${pluginRoot}/config/config/config.yaml`
    if (!fs.existsSync(configPath)) {
      console.error('[COMFYUI-PLUGIN] 设置文件不存在，将使用默认设置文件')
      fs.copyFileSync(configDefaultPath, configPath)
    }
    const defYaml = Config.getDefConfig()
    const yaml = Config.getConfig()
    for (const key in defYaml) {
      if (!(key in yaml)) yaml[key] = defYaml[key]
    }
    for (const key in yaml) {
      if (!(key in defYaml)) delete yaml[key]
    }
    Config.setConfig(yaml)

    const defDrawPath = `${pluginRoot}/config/config/def_draw_params.yaml`
    if (!fs.existsSync(defDrawPath)) fs.writeFileSync(defDrawPath, '', 'utf-8')

    const wfDir = `${pluginRoot}/config/workflows`
    if (!fs.existsSync(wfDir)) {
      fs.mkdirSync(wfDir, { recursive: true })
      console.error('[COMFYUI-PLUGIN] 工作流目录不存在，已自动创建')
    }

    const tmpDir = `${pluginRoot}/resources/tmp`
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  }
}

export default new Init()
