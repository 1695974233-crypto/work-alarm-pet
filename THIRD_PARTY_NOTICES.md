# 开源来源

本项目的 Electron 透明桌宠窗口配置、跨工作空间显示、showInactive 显示方式，以及基于屏幕坐标的拖动处理，改编自：

- TonyNa-code/desktop-pet
- https://github.com/TonyNa-code/desktop-pet
- 核验基线：81a79cf37f6865f83f1f4086be5b362c07ae1fc0
- 上游 src/main.js：createWindow、beginDrag、moveDrag、endDrag
- MIT，Copyright (c) 2026 Desktop Pet Contributors，完整许可证见 LICENSE。

本项目重新制作了 SVG 机器人及界面，没有复用上游角色或品牌图像。
任务模型、排期、消息确认、提醒去重、模拟时钟和业务界面为本项目新增。

运行时依赖 Electron（MIT），开发依赖 electron-builder（MIT）、playwright-core（Apache-2.0）；其依赖许可证保留在 npm 依赖中。
