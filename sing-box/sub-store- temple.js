{
  "dns": {
    "fakeip": {
      "enabled": true,
      "inet4_range": "198.18.0.0/15",
      "inet6_range": "fc00::/18"
    },
    "servers": [
      {
        "tag": "google",
        "address": "https://8.8.8.8/dns-query",
        "detour": "proxy"
      },
      {
        "tag": "tx",
        "address": "https://120.53.53.53/dns-query",
        "detour": "direct"
      },
      {
        "tag": "fakeip",
        "address": "fakeip"
      }
    ],
    "rules": [
      {
        "outbound": "any",
        "server": "tx",
        "disable_cache": true
      },
      {
        "clash_mode": "Direct",
        "server": "tx"
      },
      {
        "clash_mode": "Global",
        "server": "fakeip"
      },
      {
        "query_type": [
          "A",
          "AAAA"
        ],
        "server": "fakeip",
        "rewrite_ttl": 1
      },
      {
        "rule_set": "geosite-cn",
        "server": "tx"
      }
    ],
    "final": "google",
    "independent_cache": true
  },
  "route": {
    "rules": [
      {
        "port": 53,
        "outbound": "dns-out"
      },
      {
        "ip_is_private": true,
        "outbound": "direct"
      },
      {
        "clash_mode": "Direct",
        "outbound": "direct"
      },
      {
        "clash_mode": "Global",
        "outbound": "GLOBAL"
      },
      {
        "rule_set": "bilibili",
        "outbound": "bilibili"
      },
      {
        "rule_set": [
          "geoip-netflix",
          "geosite-netflix"
        ],
        "outbound": "netflix"
      },
      {
        "rule_set": "bahamut",
        "outbound": "bahamut"
      },
      {
        "rule_set": "youtube",
        "outbound": "youtube"
      },
      {
        "rule_set": "openai",
        "outbound": "openai"
      },
      {
        "rule_set": [
          "geoip-google",
          "geosite-google"
        ],
        "outbound": "google"
      },
      {
        "rule_set": [
          "geoip-apple",
          "geosite-apple"
        ],
        "outbound": "apple"
      },
      {
        "rule_set": [
          "geoip-telegram",
          "geosite-telegram"
        ],
        "outbound": "telegram"
      },
      {
        "rule_set": [
          "geoip-cn",
          "geosite-cn"
        ],
        "outbound": "cn"
      },
      {
        "rule_set": "geolocation-!cn",
        "outbound": "proxy"
      }
    ],
    "rule_set": [
      {
        "tag": "geoip-apple",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geoip/apple.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-apple",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geosite/apple.srs",
        "download_detour": "direct"
      },
      {
        "tag": "bahamut",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geosite/bahamut.srs",
        "download_detour": "direct"
      },
      {
        "tag": "bilibili",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geosite/bilibili.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-cn",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/cn.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-cn",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-google",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geoip/google.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-google",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geosite/google.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geolocation-!cn",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/geolocation-!cn.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-netflix",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geoip/netflix.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-netflix",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geosite/netflix.srs",
        "download_detour": "direct"
      },
      {
        "tag": "openai",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/openai.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geoip-telegram",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geoip/telegram.srs",
        "download_detour": "direct"
      },
      {
        "tag": "geosite-telegram",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geosite/telegram.srs",
        "download_detour": "direct"
      },
      {
        "tag": "youtube",
        "type": "remote",
        "format": "binary",
        "url": "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo-lite/geosite/youtube.srs",
        "download_detour": "direct"
      }
    ],
    "final": "final",
    "auto_detect_interface": true
  },
  "outbounds": [
    {
      "tag": "proxy",
      "type": "selector",
      "outbounds": [
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto",
        "direct"
      ],
      "default": "all-auto"
    },
    {
      "tag": "google",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "proxy"
    },
    {
      "tag": "apple",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "direct"
    },
    {
      "tag": "telegram",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "proxy"
    },
    {
      "tag": "bilibili",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "direct"
    },
    {
      "tag": "netflix",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "proxy"
    },
    {
      "tag": "bahamut",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "proxy"
    },
    {
      "tag": "youtube",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "proxy"
    },
    {
      "tag": "openai",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "proxy"
    },
    {
      "tag": "cn",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "direct"
    },
    {
      "tag": "final",
      "type": "selector",
      "outbounds": [
        "proxy",
        "direct",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "proxy"
    },
    {
      "tag": "hk",
      "type": "selector",
      "outbounds": []
    },
    {
      "tag": "tw",
      "type": "selector",
      "outbounds": []
    },
    {
      "tag": "jp",
      "type": "selector",
      "outbounds": []
    },
    {
      "tag": "sg",
      "type": "selector",
      "outbounds": []
    },
    {
      "tag": "us",
      "type": "selector",
      "outbounds": []
    },
    {
      "tag": "all",
      "type": "selector",
      "outbounds": []
    },
    {
      "tag": "hk-auto",
      "type": "urltest",
      "outbounds": [],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "1m",
      "tolerance": 50
    },
    {
      "tag": "tw-auto",
      "type": "urltest",
      "outbounds": [],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "1m",
      "tolerance": 50
    },
    {
      "tag": "jp-auto",
      "type": "urltest",
      "outbounds": [],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "1m",
      "tolerance": 50
    },
    {
      "tag": "sg-auto",
      "type": "urltest",
      "outbounds": [],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "1m",
      "tolerance": 50
    },
    {
      "tag": "us-auto",
      "type": "urltest",
      "outbounds": [],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "1m",
      "tolerance": 50
    },
    {
      "tag": "all-auto",
      "type": "urltest",
      "outbounds": [],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "1m",
      "tolerance": 50
    },
    {
      "tag": "GLOBAL",
      "type": "selector",
      "outbounds": [
        "direct",
        "proxy",
        "hk",
        "hk-auto",
        "tw",
        "tw-auto",
        "jp",
        "jp-auto",
        "sg",
        "sg-auto",
        "us",
        "us-auto",
        "all",
        "all-auto"
      ],
      "default": "direct"
    },
    {
      "tag": "direct",
      "type": "direct"
    },
    {
      "tag": "dns-out",
      "type": "dns"
    }
  ],
  "inbounds": [
    {
      "type": "tun",
      "inet4_address": "172.19.0.0/30",
      "inet6_address": "fdfe:dcba:9876::0/126",
      "stack": "system",
      "auto_route": true,
      "sniff": true,
      "platform": {
        "http_proxy": {
          "enabled": true,
          "server": "127.0.0.1",
          "server_port": 7890
        }
      }
    },
    {
      "type": "mixed",
      "listen": "127.0.0.1",
      "listen_port": 7890,
      "sniff": true
    }
  ],
  "experimental": {
    "clash_api": {
      "external_controller": "127.0.0.1:9090",
      "external_ui": "ui",
      "external_ui_download_url": "https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip",
      "external_ui_download_detour": "proxy"
    },
    "cache_file": {
      "enabled": true,
      "store_fakeip": true
    }
  },
  "log": {
    "disabled": false,
    "level": "info",
    "timestamp": true
  }
}
