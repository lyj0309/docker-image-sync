export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const path = url.pathname.slice(1); // 去掉开头的 '/'
      const repo = path.split('/')[0];
  
      if (!repo) {
        return new Response('仓库名称是必需的，例如：https://example.worker.com/nginx', { status: 400 });
      }
  
      try {
        console.log(`处理仓库: ${repo}`);
  
        // 获取 Docker Hub 上的 digest
        const digest = await getDockerDigest(repo, env);
        if (!digest) {
          console.log('未找到 digest 信息');
          return new Response('未找到 digest 信息', { status: 500 });
        }
  
        console.log(`从 Docker Hub 获取到的 digest: ${digest}`);
  
        // 检查 KV 中是否存在该 digest
        const existingValue = await env.DOCKER_DIGESTS.get(digest);
        console.log(`KV 中 digest (${digest}) 的值: ${existingValue}`);
  
        if (existingValue === "success") {
          // Digest 已存在且已同步，返回阿里云镜像地址
          const registryUrl = `registry.cn-beijing.aliyuncs.com/lyjp/${repo}`;
          console.log(`返回阿里云镜像地址: ${registryUrl}`);
          return new Response(registryUrl, { status: 200 });
        } else if (existingValue === "pending") {
          // 同步正在进行中
          return new Response('同步正在进行中，请稍后重试。', { status: 202 });
        } else {
          // Digest 不存在或状态非 "success"，设置为 "pending" 并触发 GitHub Action
          console.log('Digest 不存在或状态非 "success"，设置为 "pending" 并触发 GitHub Action');
          await env.DOCKER_DIGESTS.put(digest, "pending");
          const triggerSuccess = await triggerGitHubAction(repo, digest, env);
          if (!triggerSuccess) {
            console.log('触发 GitHub Action 失败，重置 KV 状态');
            await env.DOCKER_DIGESTS.put(digest, "failed");
            return new Response('触发 GitHub Action 失败', { status: 500 });
          }
  
          // 返回阿里云镜像地址
          const registryUrl = `registry.cn-beijing.aliyuncs.com/lyjp/${repo}`;
          console.log(`返回阿里云镜像地址: ${registryUrl}`);
          return new Response(registryUrl, { status: 200 });
        }
      } catch (error) {
        console.error(`内部错误: ${error.message}`);
        return new Response(`内部错误: ${error.message}`, { status: 500 });
      }
    },
  };
  
  /**
   * 从 Docker Hub 获取指定仓库的 latest 标签的 digest
   * @param {string} repo 
   * @param {object} env
   * @returns {Promise<string|null>}
   */
  async function getDockerDigest(repo, env) {
    const dockerHubUrl = `https://hub.docker.com/v2/repositories/library/${repo}/tags/latest`;
    const response = await fetch(dockerHubUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
  
    if (!response.ok) {
      throw new Error(`无法从 Docker Hub 获取数据: ${response.statusText}`);
    }
  
    const data = await response.json();
    if (data && data.images && data.images.length > 0) {
      // Docker Hub 的 API 返回的数据结构可能包含多个镜像，选择第一个的 digest
      return data.images[0].digest || null;
    }
  
    return null;
  }
  
  /**
   * 触发 GitHub Actions 工作流
   * @param {string} repo 
   * @param {string} digest
   * @param {object} env
   * @returns {Promise<boolean>}
   */
  async function triggerGitHubAction(repo, digest, env) {
    const githubApiUrl = `https://api.github.com/repos/lyj0309/docker-image-sync/actions/workflows/copy.yml/dispatches`;
    const githubToken = env.GITHUB_TOKEN; // 从环境变量中获取 GitHub 令牌
  
    const payload = {
      ref: 'main', // 根据您的默认分支调整
      inputs: {
        source: 'docker.io',
        destination: 'registry.cn-beijing.aliyuncs.com',
        source_repo: `library/${repo}:latest`,
        destination_repo: `lyjp/${repo}:latest`,
        digest: digest // 添加 digest 作为输入
      }
    };
  
    console.log(`触发 GitHub Action 的 payload: ${JSON.stringify(payload)}`);
  
    const response = await fetch(githubApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Cloudflare-Worker' // 添加 User-Agent 头部
      },
      body: JSON.stringify(payload)
    });
  
    console.log(`GitHub API 响应状态: ${response.status}`);
  
    if (response.status === 204) { // 成功触发时 GitHub 返回 204 No Content
      console.log('成功触发 GitHub Action');
      return true;
    } else {
      const errorText = await response.text();
      console.error(`GitHub API 错误: ${response.status} - ${errorText}`);
      return false;
    }
  }
  