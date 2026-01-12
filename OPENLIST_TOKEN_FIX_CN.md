# OpenList 扫描问题修复

## 问题分析

您遇到的问题：
1. ✅ 媒体库面板可以正常连接 OpenList
2. ❌ 扫描时报错：`isOpenList: false`，路径被识别为本地路径

日志显示：
```
scanFolder - originalPath: "/app/openlist:/115/audiobook3/儿童故事", isOpenList: false
Scanning local folder: /app/openlist:/115/audiobook3/儿童故事
Root path has no media folders: /app/openlist:/115/audiobook3/儿童故事
```

## 根本原因

之前的代码在创建书库时，会将 `openlist:/path` 错误地转换为 `/app/openlist:/path`：

```javascript
// 错误的代码
f.path = fileUtils.filePathToPOSIX(Path.resolve(fpath))
// Path.resolve('openlist:/115/...') => '/app/openlist:/115/...'
```

## 已完成的修复

### 1. 修复了路径处理逻辑 (`server/controllers/LibraryController.js`)

**修改内容：**
- 创建书库时，OpenList 路径不再经过 `Path.resolve()` 处理
- 更新书库时，同样跳过 OpenList 路径的本地目录检查
- OpenList 路径保持原样存储到数据库

### 2. 创建了路径修复工具 (`server/utils/fixOpenListPaths.js`)

用于修复数据库中已经存储的错误路径。

### 3. 之前已修复的认证问题

- Token 认证逻辑已修复
- 媒体库面板已可正常连接

## 如何修复现有书库

由于您的书库路径已经被错误地存储为 `/app/openlist:/115/audiobook3/儿童故事`，需要修复数据库中的路径。

### 方法 1: 运行修复脚本（推荐）

```bash
# 在 Docker 容器中运行
docker exec -it audiobookshelf_w-1 node server/utils/fixOpenListPaths.js
```

脚本会自动：
1. 查找所有包含错误 OpenList 路径的文件夹
2. 将 `/app/openlist:/path` 修复为 `openlist:/path`
3. 显示修复结果

**期望输出：**
```
OpenList 路径修复工具
============================================================
✅ 数据库连接成功

找到 1 个书库文件夹
------------------------------------------------------------

📁 文件夹 ID: xxx
   书库 ID: xxx
   ❌ 错误路径: /app/openlist:/115/audiobook3/儿童故事
   ✅ 正确路径: openlist:/115/audiobook3/儿童故事
   ✅ 已修复

============================================================
修复完成
   修复成功: 1
   修复失败: 0
   总计: 1

⚠️  请重启 Audiobookshelf 以应用更改
```

修复后重启容器：
```bash
docker-compose restart audiobookshelf
```

### 方法 2: 删除并重新创建书库

如果修复脚本无法运行：

1. 在 Audiobookshelf 中删除现有的 OpenList 书库
2. 重新创建书库，使用正确的路径格式：`openlist:/115/audiobook3/儿童故事`
3. 触发扫描

## 验证修复

重启后，触发扫描，日志应该显示：

```
scanFolder - originalPath: "openlist:/115/audiobook3/儿童故事", isOpenList: true
Scanning OpenList folder: /115/audiobook3/儿童故事
Found X items in /115/audiobook3/儿童故事
```

关键变化：
- `isOpenList: true` ✅
- `Scanning OpenList folder` ✅

## 完整修复清单

| 问题 | 状态 | 修复文件 |
|------|------|----------|
| Token 认证 401 错误 | ✅ 已修复 | `server/libs/openlistClient.js` |
| 路径被错误转换 | ✅ 已修复 | `server/controllers/LibraryController.js` |
| 数据库中的错误路径 | 需要运行脚本 | `server/utils/fixOpenListPaths.js` |

## 下一步

1. **运行修复脚本**
   ```bash
   docker exec -it audiobookshelf_w-1 node server/utils/fixOpenListPaths.js
   ```

2. **重启容器**
   ```bash
   docker-compose restart audiobookshelf
   ```

3. **触发扫描**
   - 在 Audiobookshelf 中进入书库
   - 点击"扫描"按钮

4. **查看日志确认**
   ```bash
   docker logs -f audiobookshelf_w-1 | grep OpenList
   ```

## 如果仍有问题

请提供以下信息：
1. 修复脚本的完整输出
2. 扫描时的完整日志
3. 书库设置截图

## 参考文档

- [OpenList 快速开始指南](docs/openlist-quickstart.md)
- [OpenList 认证问题排查](docs/openlist-auth-troubleshooting.md)
- [OpenList 集成文档](docs/openlist-integration.md)
