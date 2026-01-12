# OpenList 故障排查指南

## 常见问题和解决方案

### 问题 1: 扫描时提示 "Root path has no media folders"

**症状：**
```
[LibraryScanner] Scanning local folder: /app/openlist:/115/audiobook3/儿童故事
ERROR: Root path has no media folders: /app/openlist:/115/audiobook3/儿童故事
```

**原因：**
系统把 OpenList 路径当成了本地路径，没有正确识别。

**解决方案：**

#### 方案 A：使用 provider 字段（推荐）

1. 列出所有书库，找到问题书库的 ID：
   ```bash
   node server/utils/setOpenListProvider.js --list
   ```

2. 设置该书库为 OpenList 存储：
   ```bash
   node server/utils/setOpenListProvider.js <library-id>
   ```

3. 重新扫描书库

**示例：**
```bash
$ node server/utils/setOpenListProvider.js --list

=== 所有书库 ===

ID: abc-123-def-456
名称: 儿童
类型: book
存储: local (默认)
文件夹:
  - /115/audiobook3/儿童故事

$ node server/utils/setOpenListProvider.js abc-123-def-456

书库信息：
  名称: 儿童
  当前存储: local (默认)
  新存储: openlist

✓ 已将书库 "儿童" 的存储类型设置为 "openlist"

现在可以扫描此书库，系统会自动使用 OpenList API
```

#### 方案 B：修改路径格式

如果不想使用 provider，可以修改书库路径：

1. 在 Audiobookshelf 中编辑书库
2. 将路径从 `/115/audiobook3/儿童故事` 改为 `openlist:/115/audiobook3/儿童故事`
3. 保存并重新扫描

**注意：** 路径前缀支持以下格式：
- `openlist:/path` ✅ 推荐
- `openlist://path` ✅ 也可以
- `openlist:///path` ✅ 也可以

### 问题 2: 连接失败 "Connection failed"

**症状：**
```
[OpenList] Connection test failed: connect ECONNREFUSED
```

**检查步骤：**

1. **检查 OpenList 是否运行：**
   ```bash
   curl http://localhost:5244/ping
   ```
   应该返回 `pong` 或 200 OK

2. **检查环境变量：**
   ```bash
   echo $OPENLIST_URL
   echo $OPENLIST_TOKEN
   ```
   确保都有值

3. **检查网络连接：**
   ```bash
   # 如果使用 Docker，检查容器网络
   docker network ls
   docker network inspect <network-name>
   ```

4. **检查 URL 格式：**
   - ✅ `http://localhost:5244`
   - ✅ `http://openlist:5244`（Docker 内部）
   - ❌ `http://localhost:5244/`（不要末尾斜杠）
   - ❌ `https://localhost:5244`（除非配置了 SSL）

**解决方案：**

如果使用 Docker Compose，确保服务在同一网络：
```yaml
services:
  audiobookshelf:
    environment:
      - OPENLIST_URL=http://openlist:5244  # 使用服务名
  openlist:
    # ...
```

### 问题 3: Token 无效 "Unauthorized"

**症状：**
```
[OpenList] API request failed: 401 Unauthorized
```

**检查步骤：**

1. **验证 Token：**
   ```bash
   curl -H "Authorization: Bearer $OPENLIST_TOKEN" \
        $OPENLIST_URL/api/public/settings
   ```
   应该返回 JSON 数据

2. **重新生成 Token：**
   - 登录 OpenList 管理后台
   - 进入"设置" -> "其他" -> "令牌"
   - 生成新的 Token
   - 更新环境变量

3. **检查 Token 格式：**
   - Token 应该是一个长字符串
   - 不要包含空格或换行
   - 不要包含引号

### 问题 4: 扫描不到文件

**症状：**
```
[LibraryScanner] 0 item data found in folder
```

**检查步骤：**

1. **运行测试脚本：**
   ```bash
   node server/utils/testOpenList.js /115/audiobook3/儿童故事
   ```
   查看是否能列出文件

2. **检查路径是否存在：**
   ```bash
   curl -X POST $OPENLIST_URL/api/fs/list \
        -H "Authorization: Bearer $OPENLIST_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"path":"/115/audiobook3/儿童故事","password":"","page":1,"per_page":0}'
   ```

3. **检查文件格式：**
   - 确保是支持的音频格式：mp3, m4a, m4b, flac, aac, ogg, opus, wav
   - 检查文件扩展名是否正确

4. **检查目录结构：**
   ```
   /115/audiobook3/儿童故事/
   ├── 书名1/
   │   ├── 01.mp3
   │   └── 02.mp3
   └── 书名2/
       └── audiobook.m4b
   ```

### 问题 5: 扫描很慢

**症状：**
扫描 1000 个文件需要超过 15 分钟

**解决方案：**

1. **启用所有优化选项：**
   ```bash
   export IGNORE_FILE_METADATA=true
   export FAST_SCAN_MODE=true
   export SKIP_EMBEDDED_CHAPTERS=true
   ```

2. **检查网络速度：**
   ```bash
   # 测试 OpenList 响应时间
   time curl $OPENLIST_URL/ping
   ```

3. **减少并发请求：**
   - 如果 OpenList 服务器性能有限
   - 考虑分批扫描，不要一次扫描太多书库

4. **使用内网地址：**
   - 将 Audiobookshelf 和 OpenList 部署在同一网络
   - 使用内网 IP 而不是公网 IP

### 问题 6: 播放失败或卡顿

**症状：**
音频文件无法播放或播放卡顿

**检查步骤：**

1. **检查下载链接：**
   ```bash
   node server/utils/testOpenList.js /your/path
   ```
   查看是否能获取下载链接

2. **测试直接下载：**
   ```bash
   curl -I <download-url>
   ```
   检查是否返回 200 OK

3. **检查网络带宽：**
   - 确保网络带宽足够
   - 考虑使用 CDN 加速

**解决方案：**

- 使用更快的网络连接
- 考虑缓存常用文件
- 降低音频质量（如果 OpenList 支持）

## 调试技巧

### 查看详细日志

```bash
# Docker
docker logs -f audiobookshelf | grep -E "OpenList|LibraryScanner|ERROR"

# 本地运行
tail -f logs/combined.log | grep -E "OpenList|LibraryScanner|ERROR"
```

### 测试 OpenList API

```bash
# 测试连接
curl $OPENLIST_URL/ping

# 测试认证
curl -H "Authorization: Bearer $OPENLIST_TOKEN" \
     $OPENLIST_URL/api/public/settings

# 列出目录
curl -X POST $OPENLIST_URL/api/fs/list \
     -H "Authorization: Bearer $OPENLIST_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"path":"/","password":"","page":1,"per_page":10}'

# 获取文件信息
curl -X POST $OPENLIST_URL/api/fs/get \
     -H "Authorization: Bearer $OPENLIST_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"path":"/your/file.mp3","password":""}'
```

### 运行完整测试

```bash
# 设置环境变量
export OPENLIST_URL=http://localhost:5244
export OPENLIST_TOKEN=your-token

# 运行测试
node server/utils/testOpenList.js /115/audiobook3/儿童故事
```

### 检查数据库

```bash
# 进入容器
docker exec -it audiobookshelf sh

# 查看书库配置
sqlite3 /config/absdatabase.sqlite "SELECT id, name, provider FROM libraries;"

# 查看书库文件夹
sqlite3 /config/absdatabase.sqlite "SELECT * FROM libraryFolders;"
```

## 快速修复命令

### 重置书库为 OpenList 存储

```bash
# 1. 列出书库
node server/utils/setOpenListProvider.js --list

# 2. 设置为 OpenList
node server/utils/setOpenListProvider.js <library-id>

# 3. 重启服务
docker-compose restart audiobookshelf
```

### 重新扫描书库

```bash
# 通过 API 触发扫描
curl -X POST http://localhost:13378/api/libraries/<library-id>/scan \
     -H "Authorization: Bearer <your-api-token>"
```

### 清理缓存

```bash
# 删除扫描日志
rm -rf /metadata/logs/scans/*

# 重启服务
docker-compose restart audiobookshelf
```

## 获取帮助

如果以上方法都无法解决问题：

1. **收集信息：**
   - 完整的错误日志
   - 环境变量配置（隐藏敏感信息）
   - OpenList 版本
   - Audiobookshelf 版本
   - 测试脚本输出

2. **提交 Issue：**
   - GitHub Issues
   - 包含详细的复现步骤
   - 附上相关日志

3. **社区讨论：**
   - Discord 社区
   - 描述问题和已尝试的解决方案

## 预防措施

### 定期检查

```bash
# 每周运行一次测试
node server/utils/testOpenList.js /

# 检查日志中的错误
docker logs audiobookshelf | grep ERROR | tail -20
```

### 监控配置

```bash
# 创建健康检查脚本
cat > check-openlist.sh << 'EOF'
#!/bin/bash
if curl -f $OPENLIST_URL/ping > /dev/null 2>&1; then
  echo "✓ OpenList is running"
else
  echo "✗ OpenList is down"
  exit 1
fi
EOF

chmod +x check-openlist.sh
```

### 备份配置

```bash
# 备份环境变量
env | grep OPENLIST > openlist-env-backup.txt

# 备份数据库
cp /config/absdatabase.sqlite /config/absdatabase.sqlite.backup
```
