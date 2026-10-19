# Build and deployment / 构建与部署

## English

### Build the PCF

From this directory, install locked dependencies and run the static checks and build:

```powershell
npm ci
npm run typecheck
npm run lint
npm run build
```

The PCF output is written under `out/controls/`. Run `npm start` for the local test harness. Harness records are mocked; this does not validate real Dataverse writes.

### Package/import a solution

The current solution project is maintained in the sibling folder `../KonaLzSolution`. Build it from that directory:

```powershell
dotnet build KonaLzSolution.cdsproj --configuration Release
```

The unmanaged package is written to `../KonaLzSolution/bin/Release/KonaLzSolution.zip`. Import it through the target environment's Power Apps **Solutions** page. The solution uses publisher display name `KonaLz`, prefix `dev`, and the existing publisher unique name to preserve the deployed component identity.

If this control folder is cloned alone from GitHub, the sibling solution project will not be present. Include that solution project in a public distribution repository or create a solution in the target environment and add the built PCF component.

### Environment validation

Before using the control on business data, install it in a development/test environment and verify the form subgrid bindings (`SortOrder`, `ParentLookup`), column allowlist, create/update/delete permissions, choices, lookups, dates, row ordering, copy exclusions, command-bar integration, and paging. Test plugin and business-rule behavior with representative non-production records. Promote the solution only through your organization's normal review and release process.

`pac pcf push` can deploy a development build to the selected environment using a temporary solution. Verify the selected `pac` authentication/environment before running it. It does not use the publisher display configuration from the sibling solution project.

## 简体中文

### 构建 PCF

在本目录安装锁定版本的依赖，并执行静态检查和构建：

```powershell
npm ci
npm run typecheck
npm run lint
npm run build
```

PCF 输出位于 `out/controls/`。运行 `npm start` 可启动本地 Test Harness。Harness 使用模拟记录，不能验证真实 Dataverse 写入。

### 打包/导入解决方案

当前解决方案工程维护在同级目录 `../KonaLzSolution`。在该目录执行：

```powershell
dotnet build KonaLzSolution.cdsproj --configuration Release
```

非托管安装包位于 `../KonaLzSolution/bin/Release/KonaLzSolution.zip`。请通过目标环境 Power Apps 的**解决方案**页面导入。解决方案显示发布者为 `KonaLz`，前缀为 `dev`，并保留已部署组件使用的发布者内部唯一名称。

如果只从 GitHub 克隆本控件目录，同级解决方案工程不会包含在克隆内容中。公开发行版应一并纳入解决方案工程，或在目标环境创建解决方案并添加构建后的 PCF 组件。

### 环境验证

将控件用于业务数据前，先在开发/测试环境安装并验证表单子网格绑定（`SortOrder`、`ParentLookup`）、可编辑列白名单、创建/更新/删除权限、选项、查找、日期、行排序、复制排除项、命令栏集成和分页。使用代表性非生产记录测试插件和业务规则。发布到生产环境时遵循组织的审核与发布流程。

`pac pcf push` 可使用临时解决方案将开发版本推送到当前选定环境。执行前请确认 `pac` 登录和目标环境；该命令不会读取同级解决方案工程中的发布者显示名称配置。
