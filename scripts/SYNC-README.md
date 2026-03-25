# ABS 双服务器同步指南（SQLite 方案）

## 架构

```
本地服务器(扫描) ──rsync──> VPS(播放)
     │                        │
     └────── 115云存储(同路径) ─┘
```

## 同步原理

1. 停止 VPS 容器
2. 备份 VPS 的用户数据表（users, mediaProgress 等）
3. rsync 本地数据库文件覆盖 VPS
4. 恢复 VPS 用户数据表
5. rsync metadata 目录（封面、元数据文件）
6. 启动 VPS 容器

## 保留的 VPS 用户数据

- users（用户账户）
- sessions（登录会话）
- apiKeys（API 密钥）
- devices（设备信息）
- mediaProgresses（播放进度）
- playbackSessions（播放会话）
- collections / collectionBooks（收藏夹）
- playlists / playlistMediaItems（播放列表）
- feeds / feedEpisodes（RSS 订阅）
- mediaItemShares（分享）

## 使用方法

1. 编辑 `sync-to-vps.sh` 中的配置变量
2. 确保本地可以 SSH 免密登录 VPS
3. 确保 VPS 上安装了 sqlite3：`apt install sqlite3`
4. 运行：`bash sync-to-vps.sh`

## 定时同步

```bash
# 每小时同步
0 * * * * /path/to/sync-to-vps.sh >> /var/log/abs-sync.log 2>&1
```

## 注意事项

- 同步期间 VPS 服务会短暂中断（停容器→同步→启容器）
- 首次同步前 VPS 需要先手动创建用户账户
- 两台服务器的云存储挂载路径必须一致
