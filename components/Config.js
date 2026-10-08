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
      fs.writeFileSync(`${pluginRoot}/config/config/config.yaml`, YAML.stringify(config_data))
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

  /** 读取工作流模板（ComfyUI「导出(API)」出来的 json） */
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
        // 必须排序：目录返回顺序在不同系统/不同文件数下会变，
        // 而 #工作流列表 的序号是要给人记下来用的，顺序飘了序号就全错位了
        .sort((a, b) => a.localeCompare(b, 'en'))
    } catch (err) {
      return []
    }
  }
}

export default new Config()
