# Docker Image Auto Sync

自动同步 Docker Hub 镜像到阿里云容器镜像服务的工具。通过 Cloudflare Worker 和 GitHub Actions 实现自动化同步流程。

## 功能特点

- 自动检测 Docker Hub 镜像更新
- 使用 digest 确保镜像一致性
- 通过 Cloudflare KV 存储同步状态
- 使用 GitHub Actions 执行镜像同步
- 支持自动重试和状态追踪

## 工作流程

1. 请求 Cloudflare Worker 端点获取镜像
2. Worker 检查 Docker Hub 最新 digest
3. 对比 KV 存储中的同步状态
4. 需要时触发 GitHub Actions 同步
5. 返回阿里云镜像地址

## 使用方法

### API 访问

```bash
curl https://your-worker.domain.workers.dev/nginx
```

返回格式：
```
registry.cn-beijing.aliyuncs.com/{your-namespace}/nginx:latest
```

### 环境变量配置

Cloudflare Worker 需要的环境变量：
- `GITHUB_TOKEN`: GitHub Personal Access Token
- `DOCKER_DIGESTS`: Cloudflare KV 命名空间绑定

GitHub Actions 需要的 Secrets：
- `CF_API_TOKEN`: Cloudflare API Token
- `CF_ACCOUNT_ID`: Cloudflare Account ID
- `CF_KV_NAMESPACE_ID`: KV 命名空间 ID

## 部署说明

1. 在 Cloudflare Workers 部署 worker.js
2. 配置 Cloudflare KV 命名空间
3. 设置必要的环境变量和 Secrets
4. 确保 GitHub Actions 工作流配置正确

## 状态码说明

- 200: 成功返回镜像地址
- 202: 同步正在进行中
- 400: 请求参数错误
- 500: 内部服务器错误

## 许可证

MIT
