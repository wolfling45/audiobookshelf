# ABS 双服务器同步指南

## 架构说明

```
┌─────────────────┐                    ┌─────────────────┐
│   本地服务器     │                    │      VPS        │
│  (扫描+管理)    │                    │   (播放服务)    │
├─────────────────┤                    ├─────────────────┤
│ - 扫描媒体库    │   ──同步数据──>    │ - 用户播放      │
│ - 编辑元数据    │                    │ - 保存进度      │
│ - 管理封面      │                    │ - 用户管理      │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         └──────────┬───────────────────────────┘
                    │
            ┌───────▼───────┐
            │  115云存储     │
            │ (挂载到相同路径)│
            └───────────────┘
```

## API 端点

### 1. 导出媒体库数据

```bash
GET /api/sync/export
Authorization: Bearer <API_KEY>
```

返回所有媒体库相关数据（libraries, libraryItems, books, authors, series 等）

### 2. 导入媒体库数据

```bash
POST /api/sync/import
Authorization: Bearer <API_KEY>
Content-Type: application/json

# Body: 导出的 JSON 数据
```

导入数据时会：

- 使用 upsert 更新或插入记录
- 保留 VPS 上的用户数据（users, mediaProgress, sessions 等）
- 使用事务确保数据一致性

### 3. 查看同步状态

```bash
GET /api/sync/status
Authorization: Bearer <API_KEY>
```

返回当前服务器的数据统计

## 使用方法

### 方法一：使用同步脚本

1. 编辑 `sync-to-vps.sh`，配置以下变量：
   - `LOCAL_ABS_URL`: 本地 ABS 地址
   - `VPS_ABS_URL`: VPS ABS 地址
   - `LOCAL_API_KEY`: 本地 API Key
   - `VPS_API_KEY`: VPS API Key
   - `LOCAL_METADATA_ITEMS`: 本地 metadata/items 路径
   - `VPS_METADATA_ITEMS`: VPS metadata/items 路径

2. 运行脚本：
   ```bash
   chmod +x sync-to-vps.sh
   ./sync-to-vps.sh
   ```

### 方法二：手动同步

1. 导出数据：

   ```bash
   curl -X GET "http://localhost:13378/api/sync/export" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -o export.json
   ```

2. 导入到 VPS：

   ```bash
   curl -X POST "http://vps-ip:13378/api/sync/import" \
     -H "Authorization: Bearer VPS_API_KEY" \
     -H "Content-Type: application/json" \
     -d @export.json
   ```

3. 同步 metadata/items（封面和元数据文件）：
   ```bash
   rsync -avz /local/metadata/items/ user@vps:/vps/metadata/items/
   ```

## 定时同步（可选）

使用 cron 定时执行同步：

```bash
# 每小时同步一次
0 * * * * /path/to/sync-to-vps.sh >> /var/log/abs-sync.log 2>&1
```

## 注意事项

1. **ID 稳定性**：使用 `IGNORE_FILE_METADATA=true` 环境变量时，ID 基于文件路径生成，确保两台服务器挂载路径一致

2. **用户数据保护**：同步只会更新媒体库数据，不会影响 VPS 上的：
   - 用户账户
   - 播放进度
   - 播放列表
   - 收藏夹
   - API Keys

3. **封面同步**：数据库同步后，还需要 rsync 同步 `/metadata/items/` 目录中的封面文件

4. **首次设置**：VPS 首次使用前需要手动创建用户账户
