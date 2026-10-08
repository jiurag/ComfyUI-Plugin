# ComfyUI-Plugin

给 Yunzai 用的 **ComfyUI 绘图插件**。文生图 / 图生图 / 文生视频，全部走你自己搭好的 ComfyUI 工作流。

## 特点

- **工作流驱动**：LoRA、放大、改图、视频都行，一句话换工作流（`--workflow`）
- **`#重绘`**：复用上次的提示词和参数再来一张
- **`--ratio 16:9`**：画面比例，自动对接 ComfyUI 的 `ResolutionSelector` 节点
- 指令结果全部渲染成**图片卡片**
- **锅巴后台**可视化配置，不用手写 yaml
- **群聊 / 私聊白名单**，名单外的完全不响应
- `--参数` 写法兼容 [sd-plugin](https://github.com/erzaozi/sd-plugin)，老配置能直接搬

## 安装

```bash
cd <你的 Yunzai 目录>/plugins
git clone https://github.com/jiurag/ComfyUI-Plugin.git comfyui-plugin
```

重启 Yunzai，然后把 `config/config/config.yaml` 里的 `api_list` 改成你的 ComfyUI 地址
（首次启动会自动生成这个文件）。

需要 Node ≥ 18；`axios`、`yaml` 云崽本体已经带了，不用 `npm install`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `#绘图帮助` | 完整帮助菜单 |
| `#绘图 一只戴帽子的猫` | 文生图 |
| （引用图片）`#改图 换成雪天` | 图生图 / 改图 |
| `#重绘` | 复用上次的提示词再画一张 |
| `#工作流列表` / `#用工作流 3` | 看 / 切换工作流 |
| `#绘画队列` / `#取消绘画` | 看队列 / 中断当前任务 |
| `#绘图白名单` | 限制谁能用（仅主人） |

常用参数，跟在提示词后面：

```text
--size 1024x1024   --ratio 16:9   --steps 8   --seed 12345
--batch_size 2     --model 模型名.safetensors   --lora "LoRA名"   --workflow 3
```

## 接自己的工作流

ComfyUI 里调好 → 菜单「工作流 → 导出(API)」→ 把 json 放进 `config/workflows/`，
文件名就是工作流名，然后 `#用工作流 名字` 切过去。插件会顺着 KSampler 的连线
自己找提示词 / 尺寸 / 模型节点，认不出来再填 `node_map`。

## 自检

```bash
node _selftest.mjs "一只猫" krea2-t2i     # 不经过 QQ，直接出一张图
```

## 更多

- [安装步骤.txt](安装步骤.txt) —— 第一次装看这个
- [docs/详细说明.md](docs/详细说明.md) —— 参数详解、画面比例、重绘记录、白名单、锅巴适配、故障排查

许可：ISC
