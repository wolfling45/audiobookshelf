# 快速修复 - OpenList 路径识别问题

## 你的问题

路径 `openlist:/115/audiobook3/儿童故事` 被识别为本地路径 `/app/openlist:/115/audiobook3/儿童故事`

## 快速解决方案（Docker 环境）

### 方法 1：直接修改数据库（最快）

```bash
# 1. 进入容器
docker exec -it audiobookshelf sh

# 2. 查看所有书库
sqlite3 /config/absdatabase.sqlite "SELECT id, name, provider FROM libraries;"

# 3. 找到你的书库 ID（例如：abc-123-def-456），然后设置 provider
sqlite3 /config/absdatabase.sqlite "UPDATE libraries SET provider = 'openlist' WHERE id = 'abc-123-def-456';"

# 4. 验证修改
sqlite3 /config/absdatabase.sqlite "SELECT id, name, provider FROM libraries WHERE id = 'abc-123-def-456';"

# 5. 退出容器
exit

# 6. 重启容器
docker restart audiobookshelf

# 7. 在 UI 中修改书库路径，去掉 openlist: 前缀
# 将 "openlist:/115/audiobook3/儿童故事" 改为 "/115/audiobook3/儿童故事"

# 8. 重新扫描
```

### 方法 2：使用管理脚本（推荐）

```bash
# 1. 给脚本添加执行权限（Linux/Mac）
chmod +x docker-openlist-setup.sh

# Windows 用户直接运行：
bash docker-openlist-setup.sh

# 2. 查看所有书库
./docker-openlist-setup.sh list
# 或
bash docker-openlist-setup.sh list

# 3. 找到书库 ID，然后使用快速方法设置
./docker-openlist-setup.sh db-set <library-id> openlist

# 4. 重启容器
docker restart audiobookshelf

# 5. 在 UI 中修改路径（去掉 openlist: 前缀）
```

### 方法 3：重新创建书库（最简单）

如果书库是新建的，还没有扫描数据：

1. **删除现有书库**
   - 在 Audiobookshelf UI 中删除 "儿童" 书库

2. **重新创建书库**
   - 名称：儿童
   - 路径：`/115/audiobook3/儿童故事`（不要加前缀）

3. **使用脚本设置 provider**
   ```bash
   # 查看新书库的 ID
   bash docker-openlist-setup.sh list
   
   # 设置为 OpenList
   bash docker-openlist-setup.sh db-set <new-library-id> openlist
   
   # 重启
   docker restart audiobookshelf
   ```

4. **扫描书库**

## 为什么会出现这个问题？

1. 路径前缀 `openlist:` 在某些情况下被 `filePathToPOSIX` 函数处理
2. 导致路径变成 `/app/openlist:/115/...`
3. 我已经修复了这个问题，但需要重新构建镜像

## 临时解决方案（在新版本发布前）

**推荐使用 provider 字段方式：**

1. 路径不要加 `openlist:` 前缀
2. 使用数据库或脚本设置 `provider='openlist'`
3. 这样系统会自动识别为 OpenList 路径

## 验证是否成功

重启后查看日志，应该看到：

```
[LibraryScanner] Scanning OpenList folder: /115/audiobook3/儿童故事
[OpenList] Listing directory: /115/audiobook3/儿童故事
[OpenList] Found X audio files in OpenList directory
```

而不是：

```
[LibraryScanner] Scanning local folder: /app/openlist:/115/...
```

## 完整步骤示例

```bash
# === 使用 Docker 命令 ===

# 1. 进入容器
docker exec -it audiobookshelf sh

# 2. 查看书库（找到 ID）
sqlite3 /config/absdatabase.sqlite "SELECT id, name, provider FROM libraries;"

# 输出示例：
# abc-123-def-456|儿童|

# 3. 设置 provider
sqlite3 /config/absdatabase.sqlite "UPDATE libraries SET provider = 'openlist' WHERE name = '儿童';"

# 4. 验证
sqlite3 /config/absdatabase.sqlite "SELECT id, name, provider FROM libraries WHERE name = '儿童';"

# 输出应该是：
# abc-123-def-456|儿童|openlist

# 5. 退出
exit

# 6. 重启容器
docker restart audiobookshelf

# 7. 等待容器启动（约 10 秒）
sleep 10

# 8. 查看日志确认
docker logs audiobookshelf 2>&1 | grep -E "OpenList|LibraryScanner" | tail -20
```

## 如果还是不行

1. **检查环境变量**
   ```bash
   docker exec audiobookshelf sh -c 'echo $OPENLIST_URL'
   docker exec audiobookshelf sh -c 'echo $OPENLIST_TOKEN'
   ```

2. **测试 OpenList 连接**
   ```bash
   docker exec audiobookshelf node server/utils/testOpenList.js /115/audiobook3/儿童故事
   ```

3. **查看完整日志**
   ```bash
   docker logs audiobookshelf 2>&1 | tail -100
   ```

4. **提供以下信息以便进一步诊断：**
   - 完整的错误日志
   - 环境变量配置（隐藏 token）
   - 数据库中的书库信息
   - OpenList 版本

## 联系支持

如果以上方法都不行，请提供：
- 完整的日志输出
- `docker-compose.yml` 配置（隐藏敏感信息）
- 数据库查询结果

---

**注意：** 修复代码已经提交，但你需要重新构建 Docker 镜像才能使用。在新版本发布前，请使用 provider 字段方式。
