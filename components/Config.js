import YAML from 'yaml'
import fs from 'node:fs'
import { pluginRoot } from '../model/path.js'

class Config {
  getConfig() {
    try {
      return YAML.parse(fs.readFileSync(`${pluginRoot}/config/config/config.yaml`, 'utf-8'))
    } catch (err) {
      console.error('[COMFYUI-PLUGIN] 读取 config.yaml 失败', err)
      return false
    }
  }

  getDefConfig() {
    try {
      return YAML.parse(fs.readFileSync(`${pluginRoot}/config/config_default.yaml`, 'utf-8'))
    } catch (err) {
      console.error('[COMFYUI-PLUGIN] 读取 config_default.yaml 失败', err)
      return false
    }
  }

  setConfig(config_data) {
    try {
      const file = `${pluginRoot}/config/config/config.yaml`
      try {
        if (fs.existsSync(file)) {
          const raw = fs.readFileSync(file, 'utf-8')
          let parseOk = true
          try {
            YAML.parse(raw)
          } catch {
            parseOk = false
          }
          const backup = parseOk ? `${file}.bak` : `${file}.broken-${Date.now()}`
          fs.writeFileSync(backup, raw)
        }
      } catch (err) {
        console.error('[COMFYUI-PLUGIN] 备份旧配置失败', err?.message)
      }
      fs.writeFileSync(file, YAML.stringify(config_data))
      return true
    } catch (err) {
      console.error('[COMFYUI-PLUGIN] 写入 config.yaml 失败', err)
      return false
    }
  }

  getDefDrawParams() {
    try {
      return YAML.parse(fs.readFileSync(`${pluginRoot}/config/config/def_draw_params.yaml`, 'utf-8')) || {}
    } catch (err) {
      console.error('[COMFYUI-PLUGIN] 读取 def_draw_params.yaml 失败', err)
      return {}
    }
  }

  setDefDrawParams(param) {
    try {
      fs.writeFileSync(`${pluginRoot}/config/config/def_draw_params.yaml`, YAML.stringify(param), 'utf-8')
      return true
    } catch (err) {
      console.error('[COMFYUI-PLUGIN] 写入 def_draw_params.yaml 失败', err)
      return false
    }
  }

  getWorkflow(name) {
    try {
      const p = `${pluginRoot}/config/workflows/${name}.json`
      if (!fs.existsSync(p)) return false
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    } catch (err) {
      console.error(`[COMFYUI-PLUGIN] 读取工作流 ${name} 失败`, err)
      return false
    }
  }

  listWorkflows() {
    try {
      return fs
        .readdirSync(`${pluginRoot}/config/workflows`)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .sort((a, b) => a.localeCompare(b, 'en'))
    } catch (err) {
      return []
    }
  }
}

export default new Config()
