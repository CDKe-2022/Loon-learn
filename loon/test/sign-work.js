/*
 * ============================================================
 * WorkBuddy + Trae 自动签到 V2
 * Loon 3.5.1+
 *
 * 功能：
 *   1. WorkBuddy 多账号签到
 *   2. WorkBuddy Token 自动刷新
 *   3. WorkBuddy 签到状态复查
 *   4. WorkBuddy 积分查询
 *   5. Trae 多账号签到
 *   6. Trae Cloud-IDE-JWT / Bearer 双鉴权
 *   7. Trae Token 自动刷新
 *   8. Trae 签到状态复查
 *   9. 多账号串行执行
 *  10. 随机延迟
 *  11. Loon 持久化 Token
 *  12. 通知
 *
 * 注意：
 *   本脚本不输出任何 Token 内容。
 * ============================================================
 */

var SCRIPT_NAME = "WorkBuddy + Trae 自动签到 V2";

var STORE_WB = "workbuddy_trae_v2_workbuddy";
var STORE_TRAE = "workbuddy_trae_v2_trae";

var DEFAULT_TIMEOUT = 20000;

var WORKBUDDY_DEFAULT_DOMAIN = "https://www.codebuddy.cn";

var WORKBUDDY_CHECKIN_STATUS =
    "/v2/billing/meter/checkin-activity-status";

var WORKBUDDY_CHECKIN =
    "/v2/billing/meter/daily-checkin";

var WORKBUDDY_REFRESH =
    "/v2/plugin/auth/token/refresh";

var WORKBUDDY_RESOURCE =
    "/v2/billing/meter/get-user-resource";

var TRAE_API =
    "https://api.trae.cn";

var TRAE_OAUTH =
    "https://api.trae.com.cn";

var TRAE_CLIENT_ID =
    "en1oxy7wnw8j9n";

var TRAE_CHECKIN_STATUS =
    "/trae/api/v2/ug/checkin_credits/status";

var TRAE_CHECKIN_CLAIM =
    "/trae/api/v2/ug/checkin_credits/claim";

var TRAE_USAGE =
    "/trae/api/v2/pay/ide_user_ent_usage";

var TRAE_EXCHANGE_TOKEN =
    "/cloudide/api/v3/trae/oauth/ExchangeToken";


/* ============================================================
 * 基础配置
 * ============================================================
 */

var ARG = $argument || {};

var CONFIG = {
    enabled: toBool(ARG.enabled, true),

    workbuddyEnabled: toBool(
        ARG.workbuddy_enabled,
        true
    ),

    workbuddyAccounts: parseAccounts(
        ARG.workbuddy_accounts
    ),

    traeEnabled: toBool(
        ARG.trae_enabled,
        true
    ),

    traeAccounts: parseAccounts(
        ARG.trae_accounts
    ),

    cron: String(
        ARG.cron || "5 9 * * *"
    ),

    randomDelay: toNumber(
        ARG.random_delay,
        0
    ),

    notify: toBool(
        ARG.notify,
        true
    ),

    debug: toBool(
        ARG.debug,
        false
    )
};


/* ============================================================
 * 通用工具
 * ============================================================
 */

function log(message) {
    if (CONFIG.debug) {
        console.log(
            "[" +
            SCRIPT_NAME +
            "] " +
            message
        );
    }
}


function warn(message) {
    console.log(
        "[" +
        SCRIPT_NAME +
        "] " +
        message
    );
}


function safeString(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value);
}


function toBool(value, fallback) {
    if (
        value === true ||
        value === false
    ) {
        return value;
    }

    if (
        value === "true" ||
        value === "1" ||
        value === 1
    ) {
        return true;
    }

    if (
        value === "false" ||
        value === "0" ||
        value === 0
    ) {
        return false;
    }

    return fallback;
}


function toNumber(value, fallback) {
    var n = Number(value);

    if (
        isNaN(n) ||
        !isFinite(n)
    ) {
        return fallback;
    }

    return n;
}


function parseAccounts(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return [];
    }

    if (
        typeof value === "object"
    ) {
        return value instanceof Array
            ? value
            : [];
    }

    try {
        var result = JSON.parse(
            String(value)
        );

        if (
            result instanceof Array
        ) {
            return result;
        }

        return [];
    } catch (e) {
        warn(
            "账号 JSON 解析失败: " +
            e
        );

        return [];
    }
}


function randomInt(min, max) {
    return Math.floor(
        Math.random() *
        (max - min + 1)
    ) + min;
}


function sleep(ms) {
    return new Promise(function(resolve) {
        setTimeout(
            resolve,
            ms
        );
    });
}


function normalizeDomain(domain, fallback) {
    var value = safeString(
        domain
    ).trim();

    if (!value) {
        return fallback;
    }

    value = value.replace(
        /\/+$/,
        ""
    );

    if (
        value.indexOf("http://") !== 0 &&
        value.indexOf("https://") !== 0
    ) {
        value =
            "https://" +
            value;
    }

    return value;
}


function jsonObject(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return {};
    }

    if (
        typeof value === "object"
    ) {
        return value;
    }

    try {
        return JSON.parse(
            String(value)
        );
    } catch (e) {
        return {};
    }
}


function get(obj, path, fallback) {
    var current = obj;

    for (
        var i = 0;
        i < path.length;
        i++
    ) {
        if (
            current === null ||
            current === undefined
        ) {
            return fallback;
        }

        current =
            current[path[i]];
    }

    if (
        current === null ||
        current === undefined
    ) {
        return fallback;
    }

    return current;
}


function firstValue(
    obj,
    paths,
    fallback
) {
    for (
        var i = 0;
        i < paths.length;
        i++
    ) {
        var value = get(
            obj,
            paths[i],
            null
        );

        if (
            value !== null &&
            value !== undefined &&
            value !== ""
        ) {
            return value;
        }
    }

    return fallback;
}


function maskName(name) {
    var value = safeString(
        name
    );

    if (!value) {
        return "未命名账号";
    }

    return value;
}


function makeDeviceId() {
    var result = "";

    for (
        var i = 0;
        i < 16;
        i++
    ) {
        result += String(
            randomInt(0, 9)
        );
    }

    return result;
}


/* ============================================================
 * Loon HTTP 封装
 * ============================================================
 */

function httpRequest(
    method,
    url,
    headers,
    body,
    timeout
) {
    return new Promise(function(resolve) {

        var options = {
            url: url,
            headers: headers || {},
            timeout:
                timeout ||
                DEFAULT_TIMEOUT
        };

        if (
            method === "POST"
        ) {
            options.body =
                body || "";
        }

        log(
            method +
            " " +
            url
        );

        $httpClient[
            method.toLowerCase()
        ](
            options,
            function(
                error,
                response,
                responseBody
            ) {

                var result = {
                    error: error,
                    status:
                        response &&
                        response.status
                            ? response.status
                            : 0,
                    headers:
                        response &&
                        response.headers
                            ? response.headers
                            : {},
                    body:
                        responseBody ||
                        ""
                };

                resolve(result);
            }
        );
    });
}


function postJson(
    url,
    headers,
    body,
    timeout
) {
    var finalHeaders =
        headers || {};

    finalHeaders[
        "Content-Type"
    ] =
        "application/json";

    return httpRequest(
        "POST",
        url,
        finalHeaders,
        JSON.stringify(
            body || {}
        ),
        timeout
    );
}


function parseResponseBody(
    response
) {
    if (
        !response ||
        !response.body
    ) {
        return {};
    }

    return jsonObject(
        response.body
    );
}


/* ============================================================
 * 通知
 * ============================================================
 */

var RESULTS = [];


function addResult(
    platform,
    name,
    status,
    detail
) {
    RESULTS.push({
        platform: platform,
        name: name,
        status: status,
        detail: detail
    });
}


function notificationSummary() {
    var lines = [];

    for (
        var i = 0;
        i < RESULTS.length;
        i++
    ) {
        var item =
            RESULTS[i];

        lines.push(
            item.platform +
            "｜" +
            item.name +
            "｜" +
            item.status +
            (
                item.detail
                    ? "｜" +
                      item.detail
                    : ""
            )
        );
    }

    return lines.join(
        "\n"
    );
}


function notify() {
    if (!CONFIG.notify) {
        return;
    }

    var content =
        notificationSummary();

    if (!content) {
        content =
            "没有需要执行的账号";
    }

    $notification.post(
        SCRIPT_NAME,
        "执行完成",
        content
    );
}


/* ============================================================
 * WorkBuddy
 * ============================================================
 */

function WorkBuddy(account) {

    this.account =
        account || {};

    this.name =
        safeString(
            this.account.name ||
            this.account.uid ||
            "WorkBuddy"
        );

    this.uid =
        safeString(
            this.account.uid
        );

    this.accessToken =
        safeString(
            this.account.accessToken
        );

    this.refreshToken =
        safeString(
            this.account.refreshToken
        );

    this.enterpriseId =
        safeString(
            this.account.enterpriseId
        );

    this.tenantId =
        safeString(
            this.account.tenantId
        );

    this.domain =
        normalizeDomain(
            this.account.domain,
            WORKBUDDY_DEFAULT_DOMAIN
        );
}


WorkBuddy.prototype.loadPersisted =
    function() {

        if (!this.uid) {
            return;
        }

        try {

            var raw =
                $persistentStore.read(
                    STORE_WB
                );

            if (!raw) {
                return;
            }

            var data =
                jsonObject(raw);

            var saved =
                data[this.uid];

            if (!saved) {
                return;
            }

            if (
                saved.accessToken
            ) {
                this.accessToken =
                    saved.accessToken;
            }

            if (
                saved.refreshToken
            ) {
                this.refreshToken =
                    saved.refreshToken;
            }

            if (
                saved.expiresAt
            ) {
                this.account.expiresAt =
                    saved.expiresAt;
            }

            log(
                "WorkBuddy[" +
                this.name +
                "] 已加载持久化 Token"
            );

        } catch (e) {

            log(
                "WorkBuddy 持久化读取失败: " +
                e
            );
        }
    };


WorkBuddy.prototype.savePersisted =
    function() {

        if (!this.uid) {
            return;
        }

        try {

            var raw =
                $persistentStore.read(
                    STORE_WB
                );

            var data =
                jsonObject(raw);

            data[this.uid] = {
                accessToken:
                    this.accessToken,
                refreshToken:
                    this.refreshToken,
                expiresAt:
                    this.account.expiresAt ||
                    0
            };

            $persistentStore.write(
                JSON.stringify(data),
                STORE_WB
            );

        } catch (e) {

            log(
                "WorkBuddy 持久化保存失败: " +
                e
            );
        }
    };


WorkBuddy.prototype.headers =
    function() {

        var headers = {
            "Authorization":
                "Bearer " +
                this.accessToken,

            "Accept":
                "application/json",

            "User-Agent":
                "WorkBuddy"
        };

        if (this.uid) {
            headers[
                "X-User-Id"
            ] =
                this.uid;
        }

        if (this.enterpriseId) {
            headers[
                "X-Enterprise-Id"
            ] =
                this.enterpriseId;
        }

        if (this.tenantId) {
            headers[
                "X-Tenant-Id"
            ] =
                this.tenantId;
        }

        if (
            this.account.domain
        ) {
            headers[
                "X-Domain"
            ] =
                this.domain;
        }

        return headers;
    };


WorkBuddy.prototype.refresh =
    async function() {

        if (
            !this.refreshToken
        ) {

            return {
                success: false,
                message:
                    "没有 RefreshToken"
            };
        }

        var url =
            this.domain +
            WORKBUDDY_REFRESH;

        var headers = {
            "Authorization":
                "Bearer " +
                this.accessToken,

            "X-Refresh-Token":
                this.refreshToken,

            "Content-Type":
                "application/json",

            "Accept":
                "application/json"
        };

        if (this.uid) {
            headers[
                "X-User-Id"
            ] =
                this.uid;
        }

        if (this.enterpriseId) {
            headers[
                "X-Enterprise-Id"
            ] =
                this.enterpriseId;
        }

        if (this.tenantId) {
            headers[
                "X-Tenant-Id"
            ] =
                this.tenantId;
        }

        log(
            "WorkBuddy[" +
            this.name +
            "] 尝试刷新 Token"
        );

        var response =
            await httpRequest(
                "POST",
                url,
                headers,
                "",
                DEFAULT_TIMEOUT
            );

        if (
            response.error
        ) {

            return {
                success: false,
                message:
                    "刷新请求失败"
            };
        }

        var data =
            parseResponseBody(
                response
            );

        var payload =
            data.data ||
            data;

        var accessToken =
            firstValue(
                payload,
                [
                    ["accessToken"],
                    ["access_token"],
                    ["token"],
                    ["auth", "accessToken"]
                ],
                ""
            );

        var refreshToken =
            firstValue(
                payload,
                [
                    ["refreshToken"],
                    ["refresh_token"],
                    ["auth", "refreshToken"]
                ],
                ""
            );

        if (!accessToken) {

            return {
                success: false,
                message:
                    firstValue(
                        data,
                        [
                            ["message"],
                            ["msg"]
                        ],
                        "刷新失败"
                    )
            };
        }

        this.accessToken =
            accessToken;

        if (refreshToken) {
            this.refreshToken =
                refreshToken;
        }

        this.savePersisted();

        return {
            success: true
        };
    };


WorkBuddy.prototype.request =
    async function(
        path,
        body
    ) {

        var url =
            this.domain +
            path;

        var response =
            await postJson(
                url,
                this.headers(),
                body || {},
                DEFAULT_TIMEOUT
            );

        if (
            response.error
        ) {

            return {
                success: false,
                response: response,
                data: {},
                networkError: true
            };
        }

        var data =
            parseResponseBody(
                response
            );

        return {
            success:
                response.status >= 200 &&
                response.status < 300,

            response:
                response,

            data:
                data,

            networkError: false
        };
    };


WorkBuddy.prototype.needRefresh =
    function(result) {

        if (!result) {
            return false;
        }

        if (
            result.response &&
            result.response.status === 401
        ) {
            return true;
        }

        var code =
            firstValue(
                result.data,
                [
                    ["code"],
                    ["data", "code"]
                ],
                null
            );

        if (
            code === 401 ||
            code === 1001 ||
            code === "401" ||
            code === "1001"
        ) {
            return true;
        }

        return false;
    };


WorkBuddy.prototype.status =
    async function() {

        var result =
            await this.request(
                WORKBUDDY_CHECKIN_STATUS,
                {}
            );

        if (
            this.needRefresh(result)
        ) {

            var refresh =
                await this.refresh();

            if (
                refresh.success
            ) {

                result =
                    await this.request(
                        WORKBUDDY_CHECKIN_STATUS,
                        {}
                    );
            }
        }

        return result;
    };


WorkBuddy.prototype.isCheckedIn =
    function(result) {

        var data =
            result &&
            result.data
                ? result.data
                : {};

        var values = [
            get(data, ["today_checked_in"], null),
            get(data, ["todayCheckedIn"], null),
            get(data, ["checked_in"], null),
            get(data, ["checkedIn"], null),
            get(data, ["data", "today_checked_in"], null),
            get(data, ["data", "todayCheckedIn"], null),
            get(data, ["data", "checked_in"], null),
            get(data, ["data", "checkedIn"], null)
        ];

        for (
            var i = 0;
            i < values.length;
            i++
        ) {

            if (
                values[i] === true ||
                values[i] === 1 ||
                values[i] === "1" ||
                values[i] === "true"
            ) {
                return true;
            }
        }

        return false;
    };


WorkBuddy.prototype.claim =
    async function() {

        var result =
            await this.request(
                WORKBUDDY_CHECKIN,
                {}
            );

        if (
            this.needRefresh(result)
        ) {

            var refresh =
                await this.refresh();

            if (
                refresh.success
            ) {

                result =
                    await this.request(
                        WORKBUDDY_CHECKIN,
                        {}
                    );
            }
        }

        return result;
    };


WorkBuddy.prototype.getCredits =
    async function() {

        var result =
            await this.request(
                WORKBUDDY_RESOURCE,
                {
                    PageNumber: 1,
                    PageSize: 50,
                    ProductCode: "",
                    Status: "",
                    PackageEndTimeRangeBegin: "",
                    PackageEndTimeRangeEnd: ""
                }
            );

        if (
            !result.success
        ) {
            return null;
        }

        var data =
            result.data || {};

        var payload =
            data.data ||
            data;

        var credits =
            firstValue(
                payload,
                [
                    ["credits"],
                    ["balance"],
                    ["totalCredits"],
                    ["total_credits"]
                ],
                null
            );

        return credits;
    };


WorkBuddy.prototype.run =
    async function() {

        this.loadPersisted();

        if (
            !this.accessToken
        ) {

            return {
                status: "失败",
                detail:
                    "缺少 AccessToken"
            };
        }

        /*
         * 第一步：查询签到状态
         */

        var statusResult =
            await this.status();

        if (
            statusResult.networkError
        ) {

            return {
                status: "失败",
                detail:
                    "状态查询网络错误"
            };
        }

        if (
            this.isCheckedIn(
                statusResult
            )
        ) {

            var alreadyCredits =
                await this.getCredits();

            return {
                status: "已签到",
                detail:
                    alreadyCredits !== null
                        ? "积分 " +
                          alreadyCredits
                        : "今日已完成"
            };
        }

        /*
         * 第二步：执行签到
         */

        var claimResult =
            await this.claim();

        if (
            claimResult.networkError
        ) {

            return {
                status: "失败",
                detail:
                    "签到请求网络错误"
            };
        }

        var claimData =
            claimResult.data ||
            {};

        var claimCode =
            firstValue(
                claimData,
                [
                    ["code"],
                    ["data", "code"]
                ],
                null
            );

        var claimMessage =
            firstValue(
                claimData,
                [
                    ["message"],
                    ["msg"],
                    ["data", "message"]
                ],
                ""
            );

        /*
         * WorkBuddy 当前实现中：
         *
         * 10001 = 今日已经签到
         * 0 / "0" = 正常请求
         */

        if (
            claimCode === 10001 ||
            claimCode === "10001"
        ) {

            return {
                status: "已签到",
                detail:
                    "服务器返回今日已签到"
            };
        }

        if (
            !claimResult.success
        ) {

            return {
                status: "失败",
                detail:
                    claimMessage ||
                    "签到失败 HTTP " +
                    claimResult.response.status
            };
        }

        /*
         * 第三步：重新查询
         */

        await sleep(1000);

        var verifyResult =
            await this.status();

        if (
            this.isCheckedIn(
                verifyResult
            )
        ) {

            var credits =
                await this.getCredits();

            return {
                status: "签到成功",
                detail:
                    credits !== null
                        ? "积分 " +
                          credits
                        : "今日签到完成"
            };
        }

        /*
         * 有些版本服务端状态同步存在延迟。
         * claim 成功时不能立即判定失败。
         */

        if (
            claimCode === 0 ||
            claimCode === "0" ||
            claimCode === null
        ) {

            return {
                status: "签到请求成功",
                detail:
                    "服务器已接受，状态可能尚未同步"
            };
        }

        return {
            status: "失败",
            detail:
                claimMessage ||
                "签到状态复查未通过"
        };
    };


/* ============================================================
 * Trae
 * ============================================================
 */

function Trae(account) {

    this.account =
        account || {};

    this.name =
        safeString(
            this.account.name ||
            this.account.userId ||
            "Trae"
        );

    this.userId =
        safeString(
            this.account.userId
        );

    this.accessToken =
        safeString(
            this.account.accessToken
        );

    this.refreshToken =
        safeString(
            this.account.refreshToken
        );

    this.deviceId =
        safeString(
            this.account.deviceId
        );

    if (
        !/^\d{16}$/.test(
            this.deviceId
        )
    ) {
        this.deviceId =
            makeDeviceId();
    }
}


Trae.prototype.loadPersisted =
    function() {

        var key =
            this.userId ||
            this.name;

        try {

            var raw =
                $persistentStore.read(
                    STORE_TRAE
                );

            if (!raw) {
                return;
            }

            var data =
                jsonObject(raw);

            var saved =
                data[key];

            if (!saved) {
                return;
            }

            if (
                saved.accessToken
            ) {
                this.accessToken =
                    saved.accessToken;
            }

            if (
                saved.refreshToken
            ) {
                this.refreshToken =
                    saved.refreshToken;
            }

            if (
                /^\d{16}$/.test(
                    saved.deviceId ||
                    ""
                )
            ) {
                this.deviceId =
                    saved.deviceId;
            }

            log(
                "Trae[" +
                this.name +
                "] 已加载持久化 Token"
            );

        } catch (e) {

            log(
                "Trae 持久化读取失败: " +
                e
            );
        }
    };


Trae.prototype.savePersisted =
    function() {

        var key =
            this.userId ||
            this.name;

        try {

            var raw =
                $persistentStore.read(
                    STORE_TRAE
                );

            var data =
                jsonObject(raw);

            data[key] = {
                accessToken:
                    this.accessToken,

                refreshToken:
                    this.refreshToken,

                deviceId:
                    this.deviceId
            };

            $persistentStore.write(
                JSON.stringify(data),
                STORE_TRAE
            );

        } catch (e) {

            log(
                "Trae 持久化保存失败: " +
                e
            );
        }
    };


Trae.prototype.headers =
    function(scheme) {

        var headers = {
            "Authorization":
                scheme +
                " " +
                this.accessToken,

            "Content-Type":
                "application/json",

            "Accept":
                "application/json",

            "x-device-id":
                this.deviceId,

            "X-User-Region":
                "CN",

            "User-Agent":
                "VSCode 1.107.1 (TRAE SOLO CN)"
        };

        return headers;
    };


Trae.prototype.refresh =
    async function() {

        if (
            !this.refreshToken
        ) {

            return {
                success: false,
                message:
                    "没有 RefreshToken"
            };
        }

        var url =
            TRAE_OAUTH +
            TRAE_EXCHANGE_TOKEN;

        var body = {
            ClientID:
                TRAE_CLIENT_ID,

            RefreshToken:
                this.refreshToken,

            UserID:
                this.userId
        };

        log(
            "Trae[" +
            this.name +
            "] 尝试 ExchangeToken"
        );

        var response =
            await postJson(
                url,
                {
                    "Accept":
                        "application/json"
                },
                body,
                DEFAULT_TIMEOUT
            );

        if (
            response.error
        ) {

            return {
                success: false,
                message:
                    "Token 刷新网络错误"
            };
        }

        var data =
            parseResponseBody(
                response
            );

        var payload =
            data.data ||
            data;

        var accessToken =
            firstValue(
                payload,
                [
                    ["AccessToken"],
                    ["accessToken"],
                    ["access_token"],
                    ["Token"],
                    ["token"]
                ],
                ""
            );

        var refreshToken =
            firstValue(
                payload,
                [
                    ["RefreshToken"],
                    ["refreshToken"],
                    ["refresh_token"]
                ],
                ""
            );

        var boundDeviceId =
            firstValue(
                payload,
                [
                    ["BoundDeviceID"],
                    ["boundDeviceID"],
                    ["bound_device_id"]
                ],
                ""
            );

        if (!accessToken) {

            return {
                success: false,
                message:
                    firstValue(
                        data,
                        [
                            ["message"],
                            ["msg"]
                        ],
                        "ExchangeToken 失败"
                    )
            };
        }

        this.accessToken =
            accessToken;

        if (refreshToken) {
            this.refreshToken =
                refreshToken;
        }

        if (
            /^\d{16}$/.test(
                safeString(
                    boundDeviceId
                )
            )
        ) {
            this.deviceId =
                boundDeviceId;
        }

        this.savePersisted();

        return {
            success: true
        };
    };


Trae.prototype.request =
    async function(
        path,
        body,
        scheme
    ) {

        var url =
            TRAE_API +
            path;

        var response =
            await postJson(
                url,
                this.headers(
                    scheme
                ),
                body || {},
                DEFAULT_TIMEOUT
            );

        var data =
            parseResponseBody(
                response
            );

        return {
            response:
                response,

            data:
                data,

            success:
                response.status >= 200 &&
                response.status < 300,

            networkError:
                !!response.error
        };
    };


Trae.prototype.bizCode =
    function(result) {

        if (
            !result ||
            !result.data
        ) {
            return null;
        }

        return firstValue(
            result.data,
            [
                ["code"],
                ["Code"],
                ["data", "code"],
                ["data", "Code"]
            ],
            null
        );
    };


Trae.prototype.requestWithAuth =
    async function(
        path,
        body,
        allowBearerFallback
    ) {

        /*
         * 当前实现优先：
         *
         * Cloud-IDE-JWT
         */

        var result =
            await this.request(
                path,
                body,
                "Cloud-IDE-JWT"
            );

        var code =
            this.bizCode(
                result
            );

        /*
         * HTTP 401 / 1001
         * 尝试刷新 Token
         */

        if (
            (
                result.response &&
                result.response.status === 401
            ) ||
            code === 1001 ||
            code === "1001"
        ) {

            var refresh =
                await this.refresh();

            if (
                refresh.success
            ) {

                result =
                    await this.request(
                        path,
                        body,
                        "Cloud-IDE-JWT"
                    );

                code =
                    this.bizCode(
                        result
                    );
            }
        }

        /*
         * 某些版本 / 某些接口
         * 允许 Bearer。
         */

        if (
            allowBearerFallback &&
            (
                code !== 0 &&
                code !== "0" &&
                (
                    result.response &&
                    result.response.status >= 400
                )
            )
        ) {

            log(
                "Trae[" +
                this.name +
                "] 尝试 Bearer 鉴权"
            );

            var bearerResult =
                await this.request(
                    path,
                    body,
                    "Bearer"
                );

            if (
                bearerResult.success ||
                this.bizCode(
                    bearerResult
                ) === 0 ||
                this.bizCode(
                    bearerResult
                ) === "0"
            ) {
                result =
                    bearerResult;
            }
        }

        return result;
    };


Trae.prototype.status =
    async function(
        reqSource
    ) {

        var source =
            reqSource ||
            1;

        return await this.requestWithAuth(
            TRAE_CHECKIN_STATUS,
            {
                req_source:
                    source
            },
            true
        );
    };


Trae.prototype.claim =
    async function(
        reqSource
    ) {

        var source =
            reqSource ||
            1;

        return await this.requestWithAuth(
            TRAE_CHECKIN_CLAIM,
            {
                req_source:
                    source
            },
            true
        );
    };


Trae.prototype.isCheckedIn =
    function(result) {

        var data =
            result &&
            result.data
                ? result.data
                : {};

        var values = [
            get(data, ["checked_in"], null),
            get(data, ["checkedIn"], null),
            get(data, ["did_checked_in"], null),
            get(data, ["didCheckedIn"], null),
            get(data, ["data", "checked_in"], null),
            get(data, ["data", "checkedIn"], null)
        ];

        for (
            var i = 0;
            i < values.length;
            i++
        ) {

            if (
                values[i] === true ||
                values[i] === 1 ||
                values[i] === "1" ||
                values[i] === "true"
            ) {
                return true;
            }
        }

        return false;
    };


Trae.prototype.getCredits =
    async function() {

        var result =
            await this.requestWithAuth(
                TRAE_USAGE,
                {
                    require_usage:
                        true,
                    req_source:
                        2
                },
                true
            );

        if (
            !result.success
        ) {
            return null;
        }

        var data =
            result.data ||
            {};

        /*
         * 不强行假设单一积分字段。
         * 不同版本 entitlement 返回结构可能不同。
         */

        var credits =
            firstValue(
                data,
                [
                    ["credits"],
                    ["extra_credits"],
                    ["data", "credits"],
                    ["data", "extra_credits"]
                ],
                null
            );

        return credits;
    };


Trae.prototype.run =
    async function() {

        this.loadPersisted();

        if (
            !this.accessToken
        ) {

            return {
                status: "失败",
                detail:
                    "缺少 AccessToken"
            };
        }

        /*
         * 1. 查询状态
         */

        var statusResult =
            await this.status(1);

        var statusCode =
            this.bizCode(
                statusResult
            );

        /*
         * 9074：
         * 当前活动校验失败。
         *
         * 不无限重试。
         * 尝试一次 req_source=2。
         */

        if (
            statusCode === 9074 ||
            statusCode === "9074"
        ) {

            log(
                "Trae[" +
                this.name +
                "] status 返回 9074，尝试 req_source=2"
            );

            statusResult =
                await this.status(2);

            statusCode =
                this.bizCode(
                    statusResult
                );
        }

        if (
            this.isCheckedIn(
                statusResult
            )
        ) {

            var alreadyCredits =
                await this.getCredits();

            return {
                status: "已签到",
                detail:
                    alreadyCredits !== null
                        ? "积分 " +
                          alreadyCredits
                        : "今日已完成"
            };
        }

        /*
         * 如果 status 明确返回非 0 业务码，
         * 不把它当作“未签到”继续领取。
         */

        if (
            statusCode !== null &&
            statusCode !== 0 &&
            statusCode !== "0"
        ) {

            return {
                status: "失败",
                detail:
                    firstValue(
                        statusResult.data,
                        [
                            ["message"],
                            ["msg"],
                            ["data", "message"]
                        ],
                        "状态查询业务错误 " +
                        statusCode
                    )
            };
        }

        /*
         * 2. 执行领取
         */

        var claimResult =
            await this.claim(1);

        var claimCode =
            this.bizCode(
                claimResult
            );

        /*
         * 如果 9074：
         * 尝试一次 req_source=2。
         */

        if (
            claimCode === 9074 ||
            claimCode === "9074"
        ) {

            log(
                "Trae[" +
                this.name +
                "] claim 返回 9074，尝试 req_source=2"
            );

            claimResult =
                await this.claim(2);

            claimCode =
                this.bizCode(
                    claimResult
                );
        }

        /*
         * 9095：
         * 当前已签到。
         */

        if (
            claimCode === 9095 ||
            claimCode === "9095"
        ) {

            return {
                status: "已签到",
                detail:
                    "服务器返回今日已签到"
            };
        }

        /*
         * 1001：
         * Token / Session 失效。
         */

        if (
            claimCode === 1001 ||
            claimCode === "1001"
        ) {

            return {
                status: "失败",
                detail:
                    "Token 已失效，请重新获取登录态"
            };
        }

        /*
         * 9074：
         * 不继续无限重试。
         */

        if (
            claimCode === 9074 ||
            claimCode === "9074"
        ) {

            return {
                status: "失败",
                detail:
                    "9074：活动校验未通过"
            };
        }

        /*
         * 非 0 业务码：
         * 明确报告错误。
         */

        if (
            claimCode !== null &&
            claimCode !== 0 &&
            claimCode !== "0"
        ) {

            return {
                status: "失败",
                detail:
                    firstValue(
                        claimResult.data,
                        [
                            ["message"],
                            ["msg"],
                            ["data", "message"]
                        ],
                        "签到业务错误 " +
                        claimCode
                    )
            };
        }

        /*
         * 3. 成功后重新查询状态
         */

        await sleep(1200);

        var verifyResult =
            await this.status(1);

        if (
            this.isCheckedIn(
                verifyResult
            )
        ) {

            var credits =
                await this.getCredits();

            return {
                status: "签到成功",
                detail:
                    credits !== null
                        ? "积分 " +
                          credits
                        : "今日签到完成"
            };
        }

        /*
         * Claim code = 0
         * 但状态接口暂时没有同步。
         */

        if (
            claimCode === 0 ||
            claimCode === "0"
        ) {

            return {
                status: "签到请求成功",
                detail:
                    "领取成功，状态可能尚未同步"
            };
        }

        return {
            status: "失败",
            detail:
                "签到后状态复查未通过"
        };
    };


/* ============================================================
 * 主流程
 * ============================================================
 */

async function runWorkBuddy() {

    if (
        !CONFIG.workbuddyEnabled
    ) {
        log(
            "WorkBuddy 已关闭"
        );

        return;
    }

    var accounts =
        CONFIG.workbuddyAccounts;

    if (
        !accounts ||
        accounts.length === 0
    ) {

        log(
            "WorkBuddy 没有配置账号"
        );

        return;
    }

    for (
        var i = 0;
        i < accounts.length;
        i++
    ) {

        var account =
            accounts[i];

        var client =
            new WorkBuddy(
                account
            );

        try {

            log(
                "开始执行 WorkBuddy[" +
                client.name +
                "]"
            );

            var result =
                await client.run();

            addResult(
                "WorkBuddy",
                maskName(
                    client.name
                ),
                result.status,
                result.detail
            );

        } catch (e) {

            addResult(
                "WorkBuddy",
                maskName(
                    client.name
                ),
                "异常",
                safeString(e)
            );

            warn(
                "WorkBuddy[" +
                client.name +
                "] 异常: " +
                e
            );
        }

        /*
         * 多账号之间增加随机延迟
         */

        if (
            i <
            accounts.length - 1
        ) {

            await delayBetweenAccounts();
        }
    }
}


async function runTrae() {

    if (
        !CONFIG.traeEnabled
    ) {
        log(
            "Trae 已关闭"
        );

        return;
    }

    var accounts =
        CONFIG.traeAccounts;

    if (
        !accounts ||
        accounts.length === 0
    ) {

        log(
            "Trae 没有配置账号"
        );

        return;
    }

    for (
        var i = 0;
        i < accounts.length;
        i++
    ) {

        var account =
            accounts[i];

        var client =
            new Trae(
                account
            );

        try {

            log(
                "开始执行 Trae[" +
                client.name +
                "]"
            );

            var result =
                await client.run();

            addResult(
                "Trae",
                maskName(
                    client.name
                ),
                result.status,
                result.detail
            );

        } catch (e) {

            addResult(
                "Trae",
                maskName(
                    client.name
                ),
                "异常",
                safeString(e)
            );

            warn(
                "Trae[" +
                client.name +
                "] 异常: " +
                e
            );
        }

        if (
            i <
            accounts.length - 1
        ) {

            await delayBetweenAccounts();
        }
    }
}


async function delayBetweenAccounts() {

    var base =
        CONFIG.randomDelay;

    if (
        base <= 0
    ) {
        return;
    }

    var seconds =
        randomInt(
            1,
            Math.max(
                1,
                Math.floor(base)
            )
        );

    log(
        "等待 " +
        seconds +
        " 秒"
    );

    await sleep(
        seconds * 1000
    );
}


/* ============================================================
 * 主入口
 * ============================================================
 */

async function main() {

    if (!CONFIG.enabled) {

        log(
            "总开关关闭"
        );

        $done();

        return;
    }

    log(
        "========== 开始执行 =========="
    );

    /*
     * WorkBuddy
     */

    await runWorkBuddy();

    /*
     * WorkBuddy 与 Trae 之间
     * 也进行一次随机间隔。
     */

    if (
        CONFIG.workbuddyEnabled &&
        CONFIG.traeEnabled &&
        CONFIG.randomDelay > 0
    ) {

        await delayBetweenAccounts();
    }

    /*
     * Trae
     */

    await runTrae();

    /*
     * 输出通知
     */

    notify();

    log(
        "=========== 执行结束 ==========="
    );

    $done();
}


main().catch(
    function(error) {

        warn(
            "主程序异常: " +
            error
        );

        try {
            notify();
        } catch (e) {}

        $done();
    }
);