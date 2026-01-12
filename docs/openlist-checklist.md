# OpenList 集成部署检查清单

## 📋 部署前检查

### 环境准备

- [ ] 已安装 Docker（如果使用 Docker 部署）
- [ ] 已安装 Node.js 20+（如果本地运行）
- [ ] 网络连接正常
- [ ] 有足够的磁盘空间（配置和元数据）

### OpenList 准备

- [ ] OpenList 已部署并运行
- [ ] 可以访问 OpenList 管理界面
- [ ] 已配置至少一个网盘存储（115/阿里云盘等）
- [ ] 网盘中有音频文件
- [ ] 已获取 API Token

## 🔧 配置检查

### 环境变量

- [ ] 已设置 `OPENLIST_URL`
- [ ] 已设置 `OPENLIST_TOKEN`
- [ ] 已启用 `IGNORE_FILE_METADATA=true`
- [ ] 已启用 `FAST_SCAN_MODE=true`（推荐）
- [ ] 已启用 `SKIP_EMBEDDED_CHAPTERS=true`（推荐）

### 配置验证

```bash
# 检查环境变量
echo $OPENLIST_URL
echo $OPENLIST_TOKEN

# 应该输出配置的值，不应该为空
```

## 🧪 连接测试

### 基础连接测试

- [ ] OpenList ping 测试通过
  ```bash
  curl http://localhost:5244/ping
  # 应该返回 200 OK
  ```

- [ ] API Token 验证通过
  ```bash
  curl -H "Authorization: Bearer your-token" \
       http://localhost:5244/api/public/settings
  # 应该返回站点设置 JSON
  ```

### 集成测试

- [ ] 运行测试脚本成功
  ```bash
  node server/utils/testOpenList.js /
  # 应该看到 ✓ 所有测试完成
  ```

- [ ] 可以列出目录内容
  ```bash
  node server/utils/testOpenList.js /audiobooks
  # 应该看到文件列表
  ```

- [ ] 可以扫描音频文件
  ```bash
  # 测试脚本应该找到音频文件
  # 输出：✓ 找到 X 个音频文件
  ```

## 📚 书库配置

### 添加书库

- [ ] 在 Audiobookshelf 中创建新书库
- [ ] 使用正确的路径格式：`openlist:///your/path`
- [ ] 路径在 OpenList 中存在
- [ ] 路径包含音频文件

### 路径格式检查

正确格式：
- ✅ `openlist:///audiobooks`
- ✅ `openlist:///115/我的有声书`
- ✅ `openlist:///阿里云盘/Audiobooks`

错误格式：
- ❌ `/audiobooks`（缺少前缀）
- ❌ `openlist://audiobooks`（缺少斜杠）
- ❌ `http://localhost:5244/audiobooks`（不是 OpenList 路径）

## 🔍 扫描检查

### 首次扫描

- [ ] 触发书库扫描
- [ ] 扫描开始（查看任务列表）
- [ ] 扫描进度正常（没有卡住）
- [ ] 扫描完成（没有错误）
- [ ] 找到预期数量的书籍

### 扫描日志检查

```bash
# 查看扫描日志
docker logs audiobookshelf | grep -E "OpenList|LibraryScanner"

# 应该看到：
# [OpenList] Client initialized with URL: ...
# [LibraryScanner] Scanning OpenList folder: ...
# [OpenList] Found X audio files in OpenList directory: ...
```

### 常见扫描问题

- [ ] 没有 "Invalid folder path" 错误
- [ ] 没有 "Connection failed" 错误
- [ ] 没有 "Failed to list directory" 错误
- [ ] 没有 "Token invalid" 错误

## 📊 性能检查

### 扫描性能

- [ ] 首次扫描时间合理（参考：1000 文件约 8 分钟）
- [ ] 增量扫描时间合理（参考：1000 文件约 2 分钟）
- [ ] 内存占用正常（参考：约 150MB）
- [ ] CPU 占用正常（扫描时会升高，完成后降低）

### 网络性能

- [ ] OpenList 响应速度正常（< 1 秒）
- [ ] 文件列表获取速度正常
- [ ] 没有频繁的超时错误
- [ ] 没有触发 API 限流

## 🎵 播放检查

### 音频播放

- [ ] 可以打开书籍详情页
- [ ] 可以看到音频文件列表
- [ ] 可以播放音频文件
- [ ] 播放流畅，没有卡顿
- [ ] 进度保存正常

### 元数据检查

- [ ] 书籍标题正确
- [ ] 作者信息正确
- [ ] 音频时长显示正确
- [ ] 文件大小显示正确
- [ ] 封面图片显示正常（如果有）

## 🔄 更新检查

### 增量扫描

- [ ] 在 OpenList 中添加新文件
- [ ] 触发增量扫描
- [ ] 新文件被检测到
- [ ] 新书籍出现在列表中

### 文件变更

- [ ] 修改文件（改变大小）
- [ ] 触发扫描
- [ ] 变更被检测到
- [ ] 元数据更新正确

## 🛡️ 安全检查

### Token 安全

- [ ] Token 不在日志中明文显示
- [ ] Token 通过环境变量配置（不在代码中）
- [ ] Token 有适当的权限（建议只读）

### 网络安全

- [ ] 使用内网地址（如果可能）
- [ ] 考虑使用 HTTPS（生产环境）
- [ ] 防火墙配置正确

## 📝 文档检查

### 必读文档

- [ ] 已阅读快速开始指南
- [ ] 已阅读完整集成文档
- [ ] 了解故障排查方法
- [ ] 知道如何查看日志

### 配置备份

- [ ] 已备份环境变量配置
- [ ] 已备份 Docker Compose 配置
- [ ] 已记录 OpenList Token
- [ ] 已记录书库路径

## 🐛 故障排查准备

### 调试工具

- [ ] 知道如何运行测试脚本
- [ ] 知道如何查看日志
- [ ] 知道如何检查网络连接
- [ ] 知道如何验证 Token

### 常用命令

```bash
# 测试连接
node server/utils/testOpenList.js /

# 查看日志
docker logs -f audiobookshelf | grep OpenList

# 检查 OpenList
curl http://localhost:5244/ping

# 验证 Token
curl -H "Authorization: Bearer $OPENLIST_TOKEN" \
     $OPENLIST_URL/api/public/settings

# 重启服务
docker-compose restart audiobookshelf
```

## ✅ 部署完成确认

### 最终检查

- [ ] 所有测试通过
- [ ] 至少一个书库扫描成功
- [ ] 可以正常播放音频
- [ ] 性能表现符合预期
- [ ] 没有错误日志

### 生产环境额外检查

- [ ] 已设置自动扫描计划
- [ ] 已配置日志轮转
- [ ] 已设置监控告警
- [ ] 已准备备份策略
- [ ] 已文档化配置信息

## 📞 获取帮助

如果遇到问题：

1. **查看日志**
   ```bash
   docker logs audiobookshelf | grep -E "OpenList|ERROR"
   ```

2. **运行测试**
   ```bash
   node server/utils/testOpenList.js /your/path
   ```

3. **查阅文档**
   - [快速开始](./openlist-quickstart.md)
   - [完整文档](./openlist-integration.md)
   - [故障排查](./openlist-integration.md#故障排查)

4. **寻求支持**
   - GitHub Issues
   - Discord 社区
   - 官方文档

## 📊 部署状态记录

### 部署信息

- 部署日期：__________
- 部署人员：__________
- OpenList 版本：__________
- Audiobookshelf 版本：__________

### 配置信息

- OpenList URL：__________
- 书库数量：__________
- 总文件数：__________
- 首次扫描时间：__________

### 问题记录

| 日期 | 问题描述 | 解决方案 | 状态 |
|------|---------|---------|------|
|      |         |         |      |
|      |         |         |      |

---

**检查清单版本**: 1.0  
**最后更新**: 2026-01-12
