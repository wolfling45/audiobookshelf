# OpenList UI 使用指南

## 🎨 可视化界面功能

现在你可以通过图形界面直接浏览和选择 OpenList 中的文件夹，就像浏览本地文件夹一样！

## 📖 使用步骤

### 1. 配置 OpenList 连接

首先确保已设置环境变量：

```bash
OPENLIST_URL=http://localhost:5244
OPENLIST_TOKEN=your-token-here
```

### 2. 添加书库

1. 进入 Audiobookshelf 设置页面
2. 点击"库"（Libraries）
3. 点击"添加书库"（Add Library）按钮

### 3. 选择存储类型

在添加书库页面，你会看到两个浏览按钮：

- **浏览文件夹**（Browse for Folder）- 浏览本地文件系统
- **浏览 OpenList**（Browse OpenList）- 浏览 OpenList 挂载的网盘

### 4. 浏览 OpenList 文件夹

点击"浏览 OpenList"按钮后：

1. **连接检查**
   - 系统会自动检查 OpenList 连接状态
   - 如果连接失败，会显示错误信息和重试按钮

2. **浏览目录**
   - 左侧面板：当前目录的子文件夹
   - 右侧面板：选中文件夹的子文件夹
   - 点击文件夹可以进入下一级
   - 点击".."可以返回上一级

3. **选择文件夹**
   - 点击想要添加的文件夹
   - 点击"选择文件夹路径"（Select Folder Path）按钮
   - 文件夹会自动添加 `openlist:` 前缀

### 5. 完成添加

1. 填写书库名称
2. 选择媒体类型（书籍/播客）
3. 选择元数据提供商
4. 点击"保存"
5. 系统会自动扫描 OpenList 中的文件

## 🎯 界面特性

### 视觉提示

- **黄色文件夹图标** 📁 - 表示目录
- **高亮显示** - 当前选中的文件夹
- **红色背景** - 已经添加过的文件夹（不能重复添加）
- **箭头图标** → - 表示当前选中的路径

### 路径显示

顶部会显示当前浏览的完整路径：
```
/115/audiobook3/儿童故事
```

### 智能检查

- **父目录检查**：不能添加已添加文件夹的父目录
- **子目录检查**：不能添加已添加文件夹的子目录
- **重复检查**：不能添加已经存在的文件夹

## 📱 界面截图说明

### 添加书库页面

```
┌─────────────────────────────────────────┐
│  媒体类型: [书籍 ▼]  名称: [我的有声书]  │
│  图标: [📚]  元数据: [Google ▼]         │
├─────────────────────────────────────────┤
│  文件夹:                                 │
│  📁 /115/audiobook3/儿童故事            │
│  📁 [新文件夹路径...]                    │
│                                          │
│  [浏览文件夹]  [浏览 OpenList]          │
└─────────────────────────────────────────┘
```

### OpenList 浏览器

```
┌─────────────────────────────────────────┐
│  ← 选择文件夹 (OpenList)                │
├─────────────────────────────────────────┤
│  当前路径: /115/audiobook3              │
├──────────────────┬──────────────────────┤
│  当前目录        │  子目录              │
├──────────────────┼──────────────────────┤
│  📁 ..          │                      │
│  📁 115      →  │  📁 audiobook1       │
│  📁 阿里云盘     │  📁 audiobook2       │
│                  │  📁 audiobook3       │
│                  │  📁 儿童故事         │
├──────────────────┴──────────────────────┤
│  [选择文件夹路径]                        │
└─────────────────────────────────────────┘
```

## 🔧 故障排查

### 问题 1: "OpenList not connected"

**原因：** OpenList 服务未运行或配置错误

**解决：**
1. 检查 OpenList 是否运行：`curl http://localhost:5244/ping`
2. 检查环境变量是否正确设置
3. 点击"重试"按钮重新连接

### 问题 2: "No directories found"

**原因：** OpenList 根目录为空或没有挂载存储

**解决：**
1. 登录 OpenList 管理后台
2. 检查是否已添加存储（115、阿里云盘等）
3. 确认存储挂载路径正确

### 问题 3: 文件夹显示为红色

**原因：** 该文件夹或其父/子目录已经添加过

**解决：**
- 这是正常的保护机制，防止重复添加
- 选择其他未添加的文件夹

## 💡 使用技巧

### 1. 组织结构建议

推荐的 OpenList 目录结构：

```
/115/
├── Audiobooks/
│   ├── 作者A/
│   │   └── 书名1/
│   └── 作者B/
│       └── 书名2/
└── Podcasts/
    ├── 播客1/
    └── 播客2/
```

### 2. 多个书库

你可以为不同类型的内容创建多个书库：

- **儿童书库**：`openlist:/115/audiobook3/儿童故事`
- **成人书库**：`openlist:/115/audiobook3/成人小说`
- **播客库**：`openlist:/115/podcasts`

### 3. 路径格式

选择后的路径会自动添加 `openlist:` 前缀：

- 选择：`/115/audiobook3/儿童故事`
- 保存为：`openlist:/115/audiobook3/儿童故事`

你也可以手动输入路径，支持以下格式：
- `openlist:/path`
- `openlist://path`
- `openlist:///path`

## 🚀 高级功能

### API 端点

如果需要通过 API 操作：

```bash
# 检查 OpenList 状态
GET /api/filesystem/openlist/status

# 列出目录
GET /api/filesystem/openlist?path=/115

# 响应示例
{
  "posix": true,
  "directories": [
    {
      "path": "/115/audiobook1",
      "dirname": "audiobook1",
      "level": 1
    }
  ],
  "isOpenList": true
}
```

### 自动化脚本

可以通过 API 批量添加书库：

```javascript
// 获取 OpenList 目录列表
const dirs = await fetch('/api/filesystem/openlist?path=/115')
  .then(r => r.json())

// 为每个目录创建书库
for (const dir of dirs.directories) {
  await fetch('/api/libraries', {
    method: 'POST',
    body: JSON.stringify({
      name: dir.dirname,
      folders: [{ fullPath: `openlist:${dir.path}` }],
      mediaType: 'book'
    })
  })
}
```

## 📚 相关文档

- [OpenList 集成文档](./openlist-integration.md)
- [快速开始指南](./openlist-quickstart.md)
- [故障排查指南](./openlist-troubleshooting.md)

## 🎉 总结

现在你可以：

✅ 通过图形界面浏览 OpenList 文件夹  
✅ 可视化选择要添加的目录  
✅ 自动检查连接状态  
✅ 智能防止重复添加  
✅ 无需手动输入路径  

享受更便捷的 OpenList 集成体验！🚀
