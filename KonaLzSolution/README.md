# EditableSortableSubgrid — KonaLz

- 发布者显示名称：`KonaLz`（中文、日文、英文相同）。
- 控件版本：`1.0.4`。
- 解决方案版本：`1.0.4.0`（Dataverse 解决方案使用四段版本号）。
- 发布者自定义前缀：`dev`。
- 发布者内部唯一名称：`PowerAppsToolsPublisher_dev`。保留已有身份，以便升级当前使用 `dev_CustomControls.EditableSortableSubgrid` 的控件。

## 构建

在本目录执行：

```powershell
dotnet build KonaLzSolution.cdsproj --configuration Release
```

生成的非托管解决方案位于 `bin/Release/EditableSortableSubgrid.zip`。

## 安装

在目标 Power Apps 环境的“解决方案”页面导入生成的 ZIP，再打开应用确认控件版本。此操作会更新解决方案中的组件。

这个正式解决方案包含上述发布者显示名称。`pac pcf push` 使用 CLI 自动生成的临时解决方案，其默认发布者显示名称不会读取本目录配置。

本项目的构建和打包不会自动连接、导入或发布到 Dataverse 环境。

