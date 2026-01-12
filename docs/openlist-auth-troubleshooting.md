# OpenList 认证问题排查指南

## 问题描述

当使用 OpenList API 时，`/ping` 端点返回 200 OK，但 `/api/fs/list` 返回 401 错误："token is invalidated"。

## 快速诊断

运行认证测试脚本：

```bash
# 设置环境变量
export OPENLIST_URL=http://your-openlist-server:5244
export OPENLIST_TOKEN=your-token-here

# 运行测试
node server/utils/testOpenListAuth.js
```

此脚本会自动测试 5 种不同的认证格式，找出正确的格式。

## 常见原因和解决方案

### 1. Token 格式问题

**症状：** `/ping` 成功，`/api/fs/list` 返回 401

**原因：** Token 可能被截断、包含额外字符或格式不正确

**解决方案：**

1. 在 OpenList 管理后台，进入 **设置 -> 其它 -> 令牌**
2. 点击"复制"按钮（不要手动选择复制）
3. Token 应该是这样的格式：
   ```
   openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4edczMXctzT8V3xtNUKxY7xNRtJ2uIE0VHERNYutZFG53L15Pls2ll18UhNj8dzYNd2
   ```
4. 确保：
   - 包含 `openlist-` 前缀
   - 没有空格、换行符或引号
   - 完整复制（通常 80-100 个字符）

### 2. Token 已过期或失效

**症状：** 之前能用，现在突然不能用了

**原因：** Token 可能已过期或被重新生成

**解决方案：**

1. 在 OpenList 管理后台重新生成 Token
2. 更新环境变量 `OPENLIST_TOKEN`
3. 重启 Audiobookshelf

### 3. OpenList 版本问题

**症状：** 不同版本的 OpenList 可能使用不同的认证方式

**解决方案：**

检查 OpenList 版本：
```bash
curl http://your-openlist-server:5244/api/public/settings | jq '.data.version'
```

已知兼容版本：
- OpenList v3.25.0+
- AList v3.x (OpenList 的上游项目)

### 4. 认证头格式问题

**症状：** Token 正确但仍然 401

**原因：** 不同版本的 OpenList/AList 可能期望不同的认证头格式

**可能的格式：**

1. **直接使用 Token（推荐）**
   ```
   Authorization: openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4ed...
   ```

2. **Bearer 格式**
   ```
   Authorization: Bearer openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4ed...
   ```

3. **自定义头**
   ```
   Token: openlist-604f88cd-0b69-4f2f-82ad-2cad65f7b4ed...
   ```

**测试方法：**

使用 curl 手动测试：

```bash
# 格式 1: 直接使用
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: your-token" \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'

# 格式 2: Bearer
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'

# 格式 3: Token 头
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'
```

成功的响应应该是：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "content": [...],
    "total": 10,
    ...
  }
}
```

### 5. 网络或代理问题

**症状：** 间歇性 401 错误

**原因：** 网络代理可能修改或删除认证头

**解决方案：**

1. 确保 Audiobookshelf 和 OpenList 在同一网络
2. 使用内网地址而不是公网地址
3. 检查是否有反向代理（nginx, traefik 等）
4. 如果使用反向代理，确保它传递了 `Authorization` 头：

   ```nginx
   # nginx 配置示例
   location /api/ {
       proxy_pass http://openlist:5244;
       proxy_set_header Authorization $http_authorization;
       proxy_pass_header Authorization;
   }
   ```

### 6. OpenList 配置问题

**症状：** Token 正确但仍然失败

**原因：** OpenList 可能启用了额外的安全设置

**检查项：**

1. 登录 OpenList 管理后台
2. 检查 **设置 -> 其它**：
   - Token 是否启用
   - 是否有 IP 白名单限制
   - 是否启用了其他安全功能

## 修改代码以支持不同认证格式

如果测试脚本发现需要使用不同的认证格式，可以修改 `server/libs/openlistClient.js`：

### 使用 Bearer 格式

```javascript
// 在 constructor 中修改
const authHeader = `Bearer ${this.token}`
```

### 使用自定义头

```javascript
// 在 constructor 中修改
this.client = axios.create({
  baseURL: this.baseURL,
  timeout: 30000,
  headers: {
    'Token': this.token,  // 或 'X-Token', 'Alist-Token' 等
    'Content-Type': 'application/json'
  }
})
```

## 调试步骤

### 步骤 1: 验证基本连接

```bash
curl http://your-openlist-server:5244/ping
```

应该返回 `pong` 或 200 OK。

### 步骤 2: 测试公共 API

```bash
curl http://your-openlist-server:5244/api/public/settings
```

应该返回站点设置（不需要认证）。

### 步骤 3: 测试认证 API

```bash
curl -X POST http://your-openlist-server:5244/api/fs/list \
  -H "Authorization: your-full-token" \
  -H "Content-Type: application/json" \
  -d '{"path":"/","password":"","page":1,"per_page":10,"refresh":false}'
```

如果返回 401，尝试不同的认证头格式。

### 步骤 4: 运行自动测试

```bash
node server/utils/testOpenListAuth.js
```

### 步骤 5: 查看详细日志

在 Docker 中：
```bash
docker logs -f audiobookshelf | grep -E "OpenList|401"
```

本地运行：
```bash
tail -f logs/combined.log | grep -E "OpenList|401"
```

## 获取帮助

如果以上方法都无法解决问题，请提供以下信息：

1. OpenList 版本（从 `/api/public/settings` 获取）
2. Token 格式（前 20 个字符）
3. 测试脚本的完整输出
4. OpenList 和 Audiobookshelf 的日志
5. 网络拓扑（是否使用代理、Docker 网络等）

## 参考资料

- [OpenList API 文档](https://openlistteam.github.io/docs/guide/api/fs.html)
- [AList API 文档](https://alist.nn.ci/guide/api/)
- [OpenList GitHub](https://github.com/OpenListTeam)
