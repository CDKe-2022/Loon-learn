## 脚本适配
  
更新时间：2023-09-18 
 
****
### 操作步骤： 

1.按照下面loon格式来填写；
```
#!name = 插件的名称，不可换行。
#!desc = 插件的功能描述，不可换行。
#!author = 作者署名，可用空格分隔多位作者的署名。
#!openUrl = 插件配置的链接，此链接可在插件界面点击该插件配置的链接跳转，仅允许配置一条链接。此链接一般用来配置教程地址、配套的前端界面地址等。
#!homepage = 插件的项目主页，此链接可在插件界面点击该插件的作者署名跳转，仅允许配置一条链接，一般用来配置插件的作者主页等。
#!icon = 插件的图标，需要120px的直角图标。
#!date = 2023-08-08 18:05:47

[General]
bypass-tun =
skip-proxy =
real-ip =
dns-server =
doh-server =
doq-server =
doh3-server =
force-http-engine-hosts =

[Rule]

[Rewrite]

[Host]

[Script]

[Mitm]

```

2.利用脚本转化器Script Hub将Quantumult X的脚本转化为对应的loon脚本；

3.将转化后的链接填入loon插件；
  
4.点击刚刚转化的插件，点击脚本，分享脚本；
 
5.将分享的脚本填入 Script那一栏；

插件中加个开关按钮

```
[Argument]
CaptureCookie = switch, false, true, tag = 捕获Cookie, desc = 此开关控制插件是否捕获Cookie

[Script]
# 捕获Cookie
http-request ^https:\/\/moapi\.wps\.cn\/app\/ios\/v1\/app$ script-path = WPS_checkin.js, requires-body = true, tag = 捕获Cookie, enable = {CaptureCookie}

```

