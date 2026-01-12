# OpenList 集成文档

## 概述

Audiobookshelf 现在支持通过 OpenList（AList 的社区分支）访问远程网盘上的音频文件，包括 115 网盘、阿里云盘等。

## 功能特性

- ✅ 通过 OpenList API 列出和扫描远程文件
- ✅ 支持递归扫描目录结构
- ✅ 兼容现有的扫描和元数据提取逻辑
- ✅ 优化的文件变动检测（只比较路径和大小）
- ✅ 自动生成稳定的伪 inode 值
- ⏳ 音频时长提取（通过 Range 请求，待实现）

## 前置条件

### 1. 部署 OpenList 服务

你需要先部署一个 OpenList 服务器并配置好网盘存储（如 115）。

参考文档：
- OpenList 官方文档：https://doc.oplist.org/
- 115 网盘配置：https://openlistteam.github.io/docs/guide/drivers/115_open.html

### 2. 获取 API Token

在 OpenList 管理后台：
1. 登录管理界面（默认 `http://your-server:5244`）
2. 进入"设置" -> "其他" -> "令牌"
3. 生成或复制 API Token

## 配置方法

### 环境变量配置

在启动 Audiobookshelf 之前设置以下环境变量：

```bash
# OpenList 服务器地址
export OPENLIST_URL=http://your-openlist-server:5244

# OpenList API Token
export OPENLIST_TOKEN=your-token-here

# 推荐：启用网盘优化模式
export IGNORE_FILE_METADATA=true
export FAST_SCAN_MODE=true
export SKIP_EMBEDDED_CHAPTERS=true
```

### Docker Compose 配置示例

```yaml
version: '3.8'
services:
  audiobookshelf:
    image: advplyr/audiobookshelf
    environment:
      - OPENLIST_URL=http://openlist:5244
      - OPENLIST_TOKEN=your-token-here
      - IGNORE_FILE_METADATA=true
      - FAST_SCAN_MODE=true
      - SKIP_EMBEDDED_CHAPTERS=true
    volumes:
      - ./config:/config
      - ./metadata:/metadata
    ports:
      - 13378:80
  
  openlist:
    image: xhofe/alist:latest
    volumes:
      - ./alist:/opt/alist/data
    ports:
      - 5244:5244
```

### Docker 命令行配置

```bash
docker run -d \
  --name audiobookshelf \
  -e OPENLIST_URL=http://your-server:5244 \
  -e OPENLIST_TOKEN=your-token \
  -e IGNORE_FILE_METADATA=true \
  -e FAST_SCAN_MODE=true \
  -e SKIP_EMBEDDED_CHAPTERS=true \
  -v /path/to/config:/config \
  -v /path/to/metadata:/metadata \
  -p 13378:80 \
  advplyr/audiobookshelf
```

## 测试连接

使用提供的测试脚本验证 OpenList 连接：

```bash
# 设置环境变量
export OPENLIST_URL=http://your-server:5244
export OPENLIST_TOKEN=your-token

# 运行测试（测试根目录）
node server/utils/testOpenList.js /

# 测试特定路径
node server/utils/testOpenList.js /audiobooks
```

测试脚本会：
1. 验证配置
2. 测试连接
3. 获取站点信息
4. 列出目录内容
5. 递归扫描音频文件
6. 获取文件详细信息

## 使用方法

### 添加 OpenList 书库

<<<<<<< HEAD
#### 方法 1：通过路径前缀

在添加书库时，使用 `openlist:` 前缀标识 OpenList 路径：

1. 在 Audiobookshelf 中创建新书库
2. 文件夹路径输入：`openlist:/audiobooks`（OpenList 中的路径）
3. 系统会自动识别为 OpenList 存储

支持的路径格式：
- `openlist:/audiobooks` - 推荐格式
- `openlist://audiobooks` - 也支持
- `openlist:///audiobooks` - 也支持

示例路径：
- `openlist:/audiobooks` - OpenList 根目录下的 audiobooks 文件夹
- `openlist:/115/我的有声书` - 115 网盘中的路径
- `openlist:/阿里云盘/Audiobooks` - 阿里云盘中的路径

#### 方法 2：通过 provider 字段（推荐）

使用脚本设置 library 的 provider 字段为 `openlist`：

```bash
# 1. 列出所有书库
node server/utils/setOpenListProvider.js --list

# 2. 设置指定书库为 OpenList 存储
node server/utils/setOpenListProvider.js <library-id>

# 3. 恢复为本地存储（如果需要）
node server/utils/setOpenListProvider.js <library-id> local
```

然后在 libraryFolders 中使用普通路径（不需要 `openlist:` 前缀）：
- `/audiobooks`
- `/115/我的有声书`
- `/阿里云盘/Audiobooks`

**推荐使用方法 2**，因为：
- 路径更简洁，不需要记住前缀格式
- 可以随时切换存储类型
- 更符合数据库设计理念
- 便于批量管理多个书库
=======
#### 方法 1：通过路径前缀（推荐）

在添加书库时，使用 `openlist://` 前缀标识 OpenList 路径：

1. 在 Audiobookshelf 中创建新书库
2. 文件夹路径输入：`openlist:///audiobooks`（OpenList 中的路径）
3. 系统会自动识别为 OpenList 存储

示例路径：
- `openlist:///audiobooks` - OpenList 根目录下的 audiobooks 文件夹
- `openlist:///115/我的有声书` - 115 网盘中的路径
- `openlist:///阿里云盘/Audiobooks` - 阿里云盘中的路径

#### 方法 2：通过 provider 字段（需要数据库操作）

直接在数据库中设置 library 的 provider 字段为 `openlist`：

```sql
UPDATE libraries SET provider = 'openlist' WHERE id = 'your-library-id';
```

然后在 libraryFolders 中使用普通路径（不需要 `openlist://` 前缀）。
>>>>>>> fab73335f1eeb57caeab801c64c28bbaa3d5870f

### 扫描行为

- **首次扫描**：会递归列出所有音频文件并提取元数据
- **增量扫描**：只检查路径和文件大小变化（不检查 inode/mtime/ctime）
- **文件监听**：OpenList 存储不支持实时文件监听，需要手动触发扫描

## 性能优化

### 网盘优化模式

启用以下环境变量可以显著提升网盘扫描速度：

```bash
# 忽略文件元数据变化（inode/mtime/ctime）
# 只通过路径和大小判断文件是否变动
export IGNORE_FILE_METADATA=true

# 快速扫描模式：只读取文件头部进行元数据提取
export FAST_SCAN_MODE=true

# 跳过嵌入章节扫描（减少文件读取）
export SKIP_EMBEDDED_CHAPTERS=true
```

### 扫描策略

1. **首次扫描**：建议在网络良好时进行，可能需要较长时间
2. **定期扫描**：设置自动扫描计划（如每天一次）
3. **手动扫描**：添加新内容后手动触发扫描

## 技术细节

### 文件标识

由于远程文件没有真实的 inode，系统会：
- 使用路径 hash 生成稳定的伪 inode 值
- 在 `IGNORE_FILE_METADATA=true` 模式下，主要依赖路径和大小判断文件变动

### API 调用

OpenList 客户端使用以下主要 API：

- `GET /ping` - 连接测试
- `GET /api/public/settings` - 获取站点设置
- `POST /api/fs/list` - 列出目录内容
- `POST /api/fs/get` - 获取文件信息

### 文件格式转换

OpenList 文件信息会被转换为与本地文件兼容的格式：

```javascript
{
  name: "audiobook.mp3",
  path: "/audiobooks/book1/audiobook.mp3",
  size: 12345678,
  mtimeMs: 1704067200000,
  ino: "generated-hash",
  isRemote: true,
  isOpenList: true
}
```

## 限制和注意事项

### 当前限制

1. **不支持文件监听**：无法实时检测远程文件变化
2. **网络依赖**：扫描速度受网络质量影响
3. **API 限流**：大量文件扫描可能触发 OpenList 的 API 限流

### 推荐配置

- **文件组织**：在 OpenList 中按书籍组织好目录结构
- **网络环境**：确保 Audiobookshelf 和 OpenList 之间网络稳定
- **并发控制**：避免同时扫描多个大型书库

## 故障排查

### 连接失败

```bash
# 检查 OpenList 是否运行
curl http://your-server:5244/ping

# 检查 Token 是否正确
curl -H "Authorization: Bearer your-token" \
     http://your-server:5244/api/public/settings
```

### 扫描失败

1. 检查日志中的 `[OpenList]` 标记
2. 验证路径是否存在：`node server/utils/testOpenList.js /your/path`
3. 确认 Token 权限是否足够

### 性能问题

1. 启用所有优化选项（见"性能优化"章节）
2. 减少单次扫描的文件数量
3. 考虑使用 OpenList 的缓存功能

## 下一步开发

- [x] OpenList 客户端实现
- [x] 文件系统抽象层（支持本地和 OpenList）
- [x] 扫描器集成
- [x] 音频时长提取（通过下载链接 + ffprobe）
- [x] Library 模型扩展（provider 字段）
- [x] Watcher 跳过 OpenList 库
- [ ] UI 支持：添加 OpenList 存储类型选择界面
- [ ] 批量操作优化：并发控制和请求合并
- [ ] 缓存机制：减少重复 API 调用
- [ ] 错误重试：网络失败自动重试
- [ ] Range 请求优化：只下载文件头部获取时长

## 相关链接

- OpenList 官方文档：https://doc.oplist.org/
- OpenList GitHub：https://github.com/OpenListTeam
- Audiobookshelf 文档：https://audiobookshelf.org/docs
