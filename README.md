# 四季轮转

一座漂在银河里的圆盘。金针匀速扫过，扫到的扇面换成下一季，樱、荫、琥珀和霜可以同时留在盘上。

## 本地运行

```bash
npm install
npm run dev
```

开发服务器在 [http://127.0.0.1:47321/fourseasion/](http://127.0.0.1:47321/fourseasion/)。

```bash
npm run build
npm run preview
```

`npm run build` 会把站点输出到 `docs/`（含 `.nojekyll`）。GitHub Pages 从默认分支的 `/docs` 目录发布，线上地址是 [https://8vdpxdrv4c-dot.github.io/fourseasion/](https://8vdpxdrv4c-dot.github.io/fourseasion/)。资源使用绝对路径 `/fourseasion/`，这样没有尾部斜杠时字体、CSS 和脚本仍能解析。

## 操作

- 拖拽旋转，滚轮或双指缩放
- 春、夏、秋、冬：金针顺时针扫到那一季铺满
- 暂停 / 播放，速度滑杆
- 全屏
- 键盘：空格暂停，`1`–`4` 换季，`F` 全屏，`[` `]` 调节速度

系统开启「减少动态效果」时，转盘默认暂停，点选季节会直接到位。再按播放即恢复转动。

画面用 Three.js 与自定义 GLSL：扇形季节蒙版、草的风、星与飘浮物都按所在角度取季，而不是整盘一起切换。
