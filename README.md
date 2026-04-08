# 青花酒同人站

一个可本地运行、也可部署到云服务器上的个人同人站。

当前能力：

- 公开首页只展示已发布文章
- 按 CP 分类展示文章
- 后台可填写原作、CP、tag
- 后台可记录每日码字数，并公开到主页
- 文章与码字数据都保存在本机 JSON 文件中

## 本地启动

建议先设置后台密码：

```bash
cd /home/lyra/love
ADMIN_PASSWORD=你的后台密码 node server.js
```

默认地址：

- 首页：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`

如果没有设置 `ADMIN_PASSWORD`，系统会使用默认密码：

`change-this-password`

这个默认值只适合本地测试，不适合上线。

## 云服务器部署

推荐环境：

- Ubuntu 24.04 或 22.04
- Node.js 18+
- Nginx
- 一个域名

目标效果：

- 所有人都能访问主页和文章详情
- 只有你自己的 IP 能访问 `/admin` 和 `/api/admin/*`
- 后台依然要求输入 `ADMIN_PASSWORD`

### 1. 上传项目到服务器

示例目标目录：

`/srv/love`

### 2. 准备运行用户

```bash
sudo useradd --system --create-home --home-dir /srv/love --shell /usr/sbin/nologin love
sudo mkdir -p /etc/love
sudo chown -R love:love /srv/love
```

如果你已经用自己的用户部署，也可以不额外创建 `love` 用户，但要对应修改 `deploy/love.service.example`。

### 3. 准备环境变量

参考：

`/home/lyra/love/deploy/love.env.example`

服务器上建议放到：

`/etc/love/love.env`

示例内容：

```bash
PORT=3000
ADMIN_PASSWORD=换成你自己的强密码
```

### 4. 配置 systemd 开机自启

模板文件：

`/home/lyra/love/deploy/love.service.example`

部署步骤：

```bash
sudo cp /srv/love/deploy/love.service.example /etc/systemd/system/love.service
sudo systemctl daemon-reload
sudo systemctl enable --now love
sudo systemctl status love
```

### 5. 配置 Nginx 反向代理

模板文件：

`/home/lyra/love/deploy/nginx.site.example`

你需要替换两个值：

- `your-domain.example`
- `YOUR_HOME_IP`

`YOUR_HOME_IP` 指你自己当前公网 IP。这个配置会让：

- 别人可以访问 `/`
- 别人可以访问文章详情页
- 别人可以访问公开 API
- 别人不能访问 `/admin`
- 别人不能访问 `/api/admin/*`

部署步骤示例：

```bash
sudo cp /srv/love/deploy/nginx.site.example /etc/nginx/sites-available/love
sudo ln -s /etc/nginx/sites-available/love /etc/nginx/sites-enabled/love
sudo nginx -t
sudo systemctl reload nginx
```

### 6. 开放防火墙

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 7. 配 HTTPS

Nginx 配好并且域名已经指向服务器后，可以用 Certbot：

```bash
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d 你的域名
```

## 后台只给你自己访问

当前推荐做法是“双保险”：

1. Nginx 用 IP 白名单限制 `/admin` 和 `/api/admin/*`
2. 应用层继续要求 `ADMIN_PASSWORD`

这意味着：

- 公开访客只能看到主页和公开文章
- 就算别人知道后台路径，没有你的 IP 也进不去
- 就算有人在你的 IP 环境里，仍然要知道后台密码

如果你的公网 IP 经常变化，后续更稳的方案是再加一层：

- Cloudflare Access
- 或 Tailscale / Zero Trust 内网访问

## 数据文件

文章：

`/home/lyra/love/data/entries`

每日码字：

`/home/lyra/love/data/daily-progress.json`
