# 假设 JSON 文件保存为 response.json
jq '.environment = "Production" |
    .receipt = {
        "receipt_type": "Production",
        "adam_id": 1295506659,
        "app_item_id": 1295506659,
        "bundle_id": "FuYuan.inkDiary",
        "application_version": "273",
        "download_id": 501823224252086983,
        "version_external_identifier": 852412438,
        "receipt_creation_date": "2022-10-11 04:49:33 Etc/GMT",
        "receipt_creation_date_ms": "1665463773000",
        "receipt_creation_date_pst": "2022-10-10 21:49:33 America/Los_Angeles",
        "request_date": "2022-10-11 04:49:47 Etc/GMT",
        "request_date_ms": "1665463787771",
        "request_date_pst": "2022-10-10 21:49:47 America/Los_Angeles",
        "original_purchase_date": "2022-10-11 04:41:31 Etc/GMT",
        "original_purchase_date_ms": "1665463291000",
        "original_purchase_date_pst": "2022-10-10 21:41:31 America/Los_Angeles",
        "original_application_version": "273",
        "in_app": [
            {
                "quantity": "1",
                "product_id": "FuYuan.inkDiary.YearB.Pro",
                "transaction_id": "430001243441642",
                "original_transaction_id": "430001243441642",
                "purchase_date": "2022-10-11 04:49:32 Etc/GMT",
                "purchase_date_ms": "1665463772000",
                "purchase_date_pst": "2022-10-10 21:49:32 America/Los_Angeles",
                "original_purchase_date": "2022-10-11 04:49:33 Etc/GMT",
                "original_purchase_date_ms": "1665463773000",
                "original_purchase_date_pst": "2022-10-10 21:49:33 America/Los_Angeles",
                "expires_date": "2099-10-14 04:49:32 Etc/GMT",
                "expires_date_ms": "4095377449000",
                "expires_date_pst": "2022-10-13 21:49:32 America/Los_Angeles",
                "web_order_line_item_id": "430000588334336",
                "is_trial_period": "true",
                "is_in_intro_offer_period": "false",
                "in_app_ownership_type": "PURCHASED"
            }
        ]
    } |
    .latest_receipt_info = [
        {
            "quantity": "1",
            "product_id": "FuYuan.inkDiary.YearB.Pro",
            "transaction_id": "430001243441642",
            "original_transaction_id": "430001243441642",
            "purchase_date": "2022-10-11 04:49:32 Etc/GMT",
            "purchase_date_ms": "1665463772000",
            "purchase_date_pst": "2022-10-10 21:49:32 America/Los_Angeles",
            "original_purchase_date": "2022-10-11 04:49:33 Etc/GMT",
            "original_purchase_date_ms": "1665463773000",
            "original_purchase_date_pst": "2022-10-10 21:49:33 America/Los_Angeles",
            "expires_date": "2099-10-14 04:49:32 Etc/GMT",
            "expires_date_ms": "4095377449000",
            "expires_date_pst": "2022-10-13 21:49:32 America/Los_Angeles",
            "web_order_line_item_id": "430000588334336",
            "is_trial_period": "true",
            "is_in_intro_offer_period": "false",
            "in_app_ownership_type": "PURCHASED",
            "subscription_group_identifier": "20505308"
        }
    ] |
    .latest_receipt = "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" ' response.json
