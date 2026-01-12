# OpenList 快速开始指南

## 5 分钟快速配置

### 第一步：部署 OpenList

使用 Docker 快速部署 OpenList：

```bash
docker run -d \
  --name openlist \
  -v /path/to/data:/opt/alist/data \
  -p 5244:5244 \
  xhofe/alist:latest
```

访问 `http://localhost:5244` 完成初始化。

### 第二步：配置 115 网盘

1. 登录 OpenList 管理后台（默认账号密码在容器日志中）
2. 进入"存储" -> "添加"
3. 选择"115 网盘"
4. 按照提示完成授权
5. 设置挂载路径，如 `/115`

### 第三步：获取 API Token

1. 在 OpenList 管理后台，进入"设置" -> "其他"
2. 找到"令牌"部分
3. 复制或生成新的 Token

### 第四步：配置 Audiobookshelf

设置环境变量：

```bash
export OPENLIST_URL=http://localhost:5244
export OPENLIST_TOKEN=your-token-here
export IGNORE_FILE_METADATA=true
export FAST_SCAN_MODE=true
```

或在 Docker Compose 中：

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
    ports:
      - 13378:80
    volumes:
      - ./config:/config
      - ./metadata:/metadata
    depends_on:
      - openlist
  
  openlist:
    image: xhofe/alist:latest
    ports:
      - 5244:5244
    volumes:
      - ./alist-data:/opt/alist/data
```

### 第五步：测试连接

```bash
# 设置环境变量
export OPENLIST_URL=http://localhost:5244
export OPENLIST_TOKEN=your-token-here

# 运行测试
node server/utils/testOpenList.js /115
```

如果看到 ✓ 标记，说明连接成功！

### 第六步：添加书库

有两种方法添加 OpenList 书库：

#### 方法 1：使用路径前缀（推荐，简单）

在 Audiobookshelf 中添加新书库：

1. 点击"添加书库"
2. 名称：`我的有声书`
3. 文件夹路径：`openlist:/115/Audiobooks`（注意：可以是 `openlist:/`、`openlist://` 或 `openlist:///`）
4. 点击"添加"

系统会自动识别这是 OpenList 路径。

#### 方法 2：设置 provider（推荐，更灵活）

1. 先在 Audiobookshelf 中正常添加书库：
   - 名称：`我的有声书`
   - 文件夹路径：`/115/Audiobooks`（普通路径，不需要前缀）

2. 然后使用脚本设置为 OpenList 存储：
   ```bash
   # 列出所有书库，找到 ID
   node server/utils/setOpenListProvider.js --list
   
   # 设置指定书库为 OpenList 存储
   node server/utils/setOpenListProvider.js <library-id>
   ```

3. 触发扫描，系统会自动使用 OpenList API

**推荐使用方法 2**，因为：
- 路径更简洁，不需要前缀
- 可以随时切换存储类型
- 更符合数据库设计

## 常见问题

### Q: 扫描时提示 "Root path has no media folders"？

A: 这是路径识别问题。使用以下方法解决：

**推荐方法：设置 provider**
```bash
# 1. 列出所有书库
node server/utils/setOpenListProvider.js --list

# 2. 设置为 OpenList 存储
node server/utils/setOpenListProvider.js <library-id>

# 3. 重新扫描
```

**或者修改路径格式：**
- 将路径从 `/115/audiobook3/儿童故事` 
- 改为 `openlist:/115/audiobook3/儿童故事`

详见：[故障排查指南](./openlist-troubleshooting.md#问题-1-扫描时提示-root-path-has-no-media-folders)

### Q: 扫描很慢怎么办？

A: 确保启用了优化选项：
```bash
export IGNORE_FILE_METADATA=true
export FAST_SCAN_MODE=true
export SKIP_EMBEDDED_CHAPTERS=true
```

### Q: 提示连接失败？

A: 检查：
1. OpenList 是否正常运行：`curl http://localhost:5244/ping`
2. Token 是否正确：检查 OpenList 管理后台
3. 网络是否可达：确保 Audiobookshelf 能访问 OpenList

### Q: 文件扫描不到？

A: 检查：
1. OpenList 中路径是否正确
2. 文件是否为支持的音频格式（mp3, m4a, m4b, flac 等）
3. 运行测试脚本查看详细信息：`node server/utils/testOpenList.js /your/path`

### Q: 如何查看日志？

A: 查找包含 `[OpenList]` 的日志：
```bash
# Docker
docker logs audiobookshelf | grep OpenList

# 本地运行
tail -f logs/combined.log | grep OpenList
```

## 性能建议

### 网络优化

- 将 Audiobookshelf 和 OpenList 部署在同一网络
- 使用内网地址而不是公网地址
- 考虑使用 CDN 加速（如果 OpenList 支持）

### 扫描优化

- 首次扫描选择网络空闲时段
- 分批添加书库，避免一次扫描太多文件
- 使用自动扫描计划（如每天凌晨）

### 存储优化

- 在 OpenList 中合理组织目录结构
- 每本书一个文件夹
- 避免过深的目录层级（建议不超过 3 层）

## 推荐目录结构

```
/115/Audiobooks/
├── 作者A/
│   ├── 书名1/
│   │   ├── 01.mp3
│   │   ├── 02.mp3
│   │   └── cover.jpg
│   └── 书名2/
│       └── audiobook.m4b
├── 作者B/
│   └── 书名3/
│       ├── CD1/
│       │   ├── 01.mp3
│       │   └── 02.mp3
│       └── CD2/
│           ├── 01.mp3
│           └── 02.mp3
└── Podcasts/
    ├── 播客1/
    └── 播客2/
```

## 下一步

- 阅读完整文档：[OpenList 集成文档](./openlist-integration.md)
- 查看示例代码：`server/utils/openlistExample.js`
- 加入社区讨论：[Discord](https://discord.gg/HQgCbd6E75)

## 故障排查命令

```bash
# 1. 测试 OpenList 连接
curl http://localhost:5244/ping

# 2. 测试 API Token
curl -H "Authorization: Bearer your-token" \
     http://localhost:5244/api/public/settings

# 3. 列出目录内容
curl -X POST http://localhost:5244/api/fs/list \
     -H "Authorization: Bearer your-token" \
     -H "Content-Type: application/json" \
     -d '{"path":"/115","password":"","page":1,"per_page":0,"refresh":false}'

# 4. 运行完整测试
node server/utils/testOpenList.js /115

# 5. 查看 Audiobookshelf 日志
docker logs -f audiobookshelf | grep -E "OpenList|ERROR"
```
