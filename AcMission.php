<?php

namespace App\Api;

use PhalApi\Api;
use PhalApi\Exception\BadRequestException;
use PhpOffice\PhpWord\TemplateProcessor;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;


/**
 * 刺客信条
 * @desc 刺客信条
 */
class AcMission extends Api
{
    
    // public $eventId;
    
    // public function __construct()
    // {
    //     $this->eventId = 'GE_21_5DayGauntletEventTemplate_20250504'; // 初始化全局变量
    // }

    public function getRules()
    {
        return array(
            'mission' => array(
                "nickname" => array("name" => "nickname",   "desc" => "nickname"),
                "eventId" => array("name" => "eventId", "defualt" => "GE_22_5DayGauntletEventTemplate_20250511", "desc" => "eventId"),
            ),
        );
    }
    
    
    function eventId(){
        return "GE_22_5DayGauntletEventTemplate_20250511";
    }

    function tokens($nickname){
        return "bhvrSession=9kE0Xn2lRl_bGfSP7WdJ3Q.2TBTgFt62M2-dBa2F0jSjK4aKJj8Faw2bNOV62rgaoi7hhErxmmuRvSzdO99zDAkUKScUCgYofyGeV_nAQKsqCEnqQRaNc25SWaW3UkB0VWDHPNvXqMsxuHz3XwE1wpGcASUUfGqKqQ2kslgTmBb_RaSWNEeQlzFkKyOoIY-jfo.1747080097088.315569259747._7QViqEPAWpX7FiaQazy6GO_Zql9szxYOx09m_yTv3o; path=/; expires=Sun, 13 May 2035 06:09:17 GMT; secure; httponly";
    }

    /**
     * 开启任务
     * @desc 开启任务
     */
    public function eventStart($nickname = 'defaultNickname')
    {
        // 最简单的处理方式
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: *');
        
        // return $this->eventId;

        $curl = new \PhalApi\CUrl();
        $curl->setHeader(
            array(
                'Host'               => 'latest.live.acr.ubisoft.com',
                'Content-Type'       => 'application/json; charset=UTF-8',
                'Accept-Language'    => 'zh-CN,zh-Hans;q=0.9',
                'Accept-Encoding'    => 'gzip, deflate, br',
                "X-Unity-Version"    => "2020.3.40f1",
                "Accept"             => "*/*",
                "DEVICE-TIME-OFFSET" => 0,
                "User-Agent"         => "AC%20Rebellion/104382 CFNetwork/1335.0.3 Darwin/21.6.0",
                "X-SAFE-JSON-ARRAY"  => true,
                "Cookie"             => $this->tokens($nickname)
            ));

        //设置信封速度
        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/eventStart';
        $json = '{"data":{"assassins":[{"id":"A1","hp":100.00,"rank":5},{"id":"A62","hp":100.00,"rank":5},{"id":"A68","hp":100.00,"rank":5}],"difficultyTier":"GauntletDifficultySetting3","level":50,"eventId":"'.$this->eventId().'"}}';

        $rs = $curl->post($url, $json, 3000);
        $r = json_decode($rs, true);

        if ( $r['data']['missionStatus']['missionId'] ){
            // $data = array(
            //     'missionIndex' => $r['data']['missionStatus']['missionIndex'],
            //     'missionId' => $r['data']['missionStatus']['missionId'],
            //     'nickname' => $nickname,
            //     'type' => 'eventStart',
            //     'update_time' => date("Y-m-d H:i:s", time()),
            //     'create_time' => date("Y-m-d H:i:s", time()),
            // );
            // \PhalApi\DI()->notorm->actaskmission->insert($data);
            \PhalApi\DI()->cache->set($nickname . 'missionIndex', $r['data']['missionStatus']['missionIndex'], 60*60*24);
            \PhalApi\DI()->cache->set($nickname . 'missionId', $r['data']['missionStatus']['missionId'], 60*60*24);
            return '启动新一轮';
        }

        //购买蓝币
        $url = 'https://latest.live.acr.ubisoft.com/api/v1/purchases/Daily_TLEEnergy_150';
        $json = '{"oldQuantity":0,"wantedQuantity":1,"currencyType":"HC"}';
        $rs = $curl->post($url, $json, 3000);

        $url = 'https://latest.live.acr.ubisoft.com/api/v1/inventories/consume';
        $json = '{"itemId":"Daily_TLEEnergy_150","quantity":1}';
        $buy = $curl->post($url, $json, 3000);

        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/meta-event/getInfo';
        $json = '{}';
        $get = $curl->post($url, $json, 3000);
        
        return array('启动新一轮失败',$this->eventId(), $rs, $buy, $get);

    }

    /**
     * 开启任务
     * @desc missionStart
     */
    public function missionStart($nickname)
    {
        // 最简单的处理方式
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: *');


        $token = $this->tokens($nickname);

        // return $token;

        // $mission = \PhalApi\DI()->notorm->actaskmission->where('nickname', $nickname)->order("id DESC")->fetchOne();
        // $missionIndex = $mission['missionIndex'];
        $missionIndex = \PhalApi\DI()->cache->get($nickname . 'missionIndex');
        // $mission = \PhalApi\DI()->cache->get($nickname . 'mission');
        $missionId = \PhalApi\DI()->cache->get($nickname . 'missionId');
        

        $curl = new \PhalApi\CUrl();
        $curl->setHeader(
            array(
                'Host'       => 'latest.live.acr.ubisoft.com',
                'Content-Type'       => 'application/json; charset=UTF-8',
                'Accept-Language'    => 'zh-CN,zh-Hans;q=0.9',
                'Accept-Encoding'    => 'gzip, deflate, br',
                "X-Unity-Version"    => "2020.3.40f1",
                "Accept"             => "*/*",
                "DEVICE-TIME-OFFSET" => 0,
                "User-Agent"         => "AC%20Rebellion/104382 CFNetwork/1335.0.3 Darwin/21.6.0",
                "X-SAFE-JSON-ARRAY"  => true,
                "Cookie"             => $token
            ));

        //收集信封
        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/missionStart';
        // $json = '{"data":{"assassins":["A1","A62","A68"],"missionStatus":{"missionIndex":'.$missionIndex.',"missionId":"'.$mission['missionId'].'"},"eventId":"'.$this->eventId().'"}}';
        $json = '{"data":{"assassins":["A1","A62","A68"],"missionStatus":{"missionIndex":'.$missionIndex.',"missionId":"'.$missionId.'"},"eventId":"'.$this->eventId().'"}}';

        $rs = $curl->post($url, $json, 3000);
        $r = json_decode($rs, true);

        if ( $r['data']['missionStatus']['missionId'] ){
            // $data = array(
            //     'missionIndex' => $r['data']['missionStatus']['missionIndex'],
            //     'missionId' => $r['data']['missionStatus']['missionId'],
            //     'nickname' => $nickname,
            //     'type' => 'missionStart',
            //     'update_time' => date("Y-m-d H:i:s", time()),
            //     'create_time' => date("Y-m-d H:i:s", time()),
            // );
            // \PhalApi\DI()->notorm->actaskmission->insert($data);
            
            \PhalApi\DI()->cache->set($nickname . 'missionIndex', $r['data']['missionStatus']['missionIndex'], 60*60*24);
            \PhalApi\DI()->cache->set($nickname . 'missionId', $r['data']['missionStatus']['missionId'], 60*60*24);
            return '任务成功';
        }

        return array($json, $rs);
    }



    /**
     * 结束任务
     * @desc missionEnd
     */
    public function missionEnd($nickname)
    {
        // 最简单的处理方式
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: *');

        $token = $this->tokens($nickname);

        // $mission = \PhalApi\DI()->notorm->actaskmission->where('nickname', $nickname)->order("id DESC")->fetchOne();
        // $missionIndex = $mission['missionIndex'];
        
        $missionIndex = \PhalApi\DI()->cache->get($nickname . 'missionIndex');
        // $mission = \PhalApi\DI()->cache->get($nickname . 'mission');
        $missionId = \PhalApi\DI()->cache->get($nickname . 'missionId');
        

        $curl = new \PhalApi\CUrl();
        $curl->setHeader(
            array(
                'Host'       => 'latest.live.acr.ubisoft.com',
                'Content-Type'       => 'application/json; charset=UTF-8',
                'Accept-Language'    => 'zh-CN,zh-Hans;q=0.9',
                'Accept-Encoding'    => 'gzip, deflate, br',
                "X-Unity-Version"    => "2020.3.40f1",
                "Accept"             => "*/*",
                "DEVICE-TIME-OFFSET" => 0,
                "User-Agent"         => "AC%20Rebellion/104382 CFNetwork/1335.0.3 Darwin/21.6.0",
                "X-SAFE-JSON-ARRAY"  => true,
                "Cookie"             => $token
            ));

        //结束任务
        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/missionEnd';
        // $json = '{"data":{"missionStatus":{"missionIndex":'.$missionIndex.',"missionId":"'.$mission['missionId'].'"},"assassins":[{"id":"A1","hp":100.00},{"id":"A62","hp":100.00},{"id":"A68","hp":100.00}],"success":true,"eventId":"'.$this->eventId().'"}}';
        $json = '{"data":{"missionStatus":{"missionIndex":'.$missionIndex.',"missionId":"'.$missionId.'"},"assassins":[{"id":"A1","hp":100.00},{"id":"A62","hp":100.00},{"id":"A68","hp":100.00}],"success":true,"eventId":"'.$this->eventId().'"}}';

        $rs = $curl->post($url, $json, 3000);
        $r = json_decode($rs, true);

        if ( $missionIndex == $r['data']['missionStatus']['missionIndex'] ){
            $r['data']['missionStatus']['missionIndex'] = 10;
        }

        if( !$r['data']['missionStatus']['missionIndex'] ){
            return 'token错误';
        }

        if( $r['data']['missionStatus']['missionId'] ){
            // $data = array(
            //     'missionIndex' => $r['data']['missionStatus']['missionIndex'],
            //     'missionId' => $r['data']['missionStatus']['missionId'],
            //     'nickname' => $nickname,
            //     'type' => 'missionEnd',
            //     'update_time' => date("Y-m-d H:i:s", time()),
            //     'create_time' => date("Y-m-d H:i:s", time()),
            // );
            // \PhalApi\DI()->notorm->actaskmission->insert($data);
            
            \PhalApi\DI()->cache->set($nickname . 'missionIndex', $r['data']['missionStatus']['missionIndex'], 60*60*24);
            \PhalApi\DI()->cache->set($nickname . 'missionId', $r['data']['missionStatus']['missionId'], 60*60*24);
            return $r;
        }
        return '结束任务错误';

    }



    /**
     * 获取buff
     * @desc getBoons
     */
    public function getBoons($nickname)
    {
        // 最简单的处理方式
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: *');

        $token = $this->tokens($nickname);

        $curl = new \PhalApi\CUrl();
        $curl->setHeader(
            array(
                'Host'       => 'latest.live.acr.ubisoft.com',
                'Content-Type'       => 'application/json; charset=UTF-8',
                'Accept-Language'    => 'zh-CN,zh-Hans;q=0.9',
                'Accept-Encoding'    => 'gzip, deflate, br',
                "X-Unity-Version"    => "2020.3.40f1",
                "Accept"             => "*/*",
                "DEVICE-TIME-OFFSET" => 0,
                "User-Agent"         => "AC%20Rebellion/104382 CFNetwork/1335.0.3 Darwin/21.6.0",
                "X-SAFE-JSON-ARRAY"  => true,
                "Cookie"             => $token
            ));

        //获取buff
        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/getBoons';
        $json = '{"data":{"difficultyTier":"GauntletDifficultySetting3","eventId":"'.$this->eventId().'"}}';

        $rs = $curl->post($url, $json, 3000);
        $r = json_decode($rs, true);

        $buff = $r['data']['endMissionBoons'][0];

        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/applySelectedBoon';
        $json = '{"data":{"selectedBoon":"'.$buff.'","eventId":"'.$this->eventId().'"}}';

        $rs = $curl->post($url, $json, 3000);
        $r = json_decode($rs, true);
        return $r;

    }


    /**
     * 获取奖励
     * @desc getBoons
     */
    public function getWard($nickname)
    {
        // 最简单的处理方式
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: *');

        $token = $this->tokens($nickname);

        $curl = new \PhalApi\CUrl();
        $curl->setHeader(
            array(
                'Host'       => 'latest.live.acr.ubisoft.com',
                'Content-Type'       => 'application/json; charset=UTF-8',
                'Accept-Language'    => 'zh-CN,zh-Hans;q=0.9',
                'Accept-Encoding'    => 'gzip, deflate, br',
                "X-Unity-Version"    => "2020.3.40f1",
                "Accept"             => "*/*",
                "DEVICE-TIME-OFFSET" => 0,
                "User-Agent"         => "AC%20Rebellion/104382 CFNetwork/1335.0.3 Darwin/21.6.0",
                "X-SAFE-JSON-ARRAY"  => true,
                "Cookie"             => $token
            ));

        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/info';
        $json = '{"data":{"eventId":"'.$this->eventId().'"}}';
        $rs = $curl->post($url, $json, 3000);
        if( $rs ){
            $r = json_decode($rs, true);
            \PhalApi\DI()->cache->set($nickname . 'missionIndex', $r['data']['missionStatus']['missionIndex'], 60*60*24);
            \PhalApi\DI()->cache->set($nickname . 'missionId', $r['data']['missionStatus']['missionId'], 60*60*24);
        }
        

        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/eventEnd';
        $json = '{"data":{"eventId":"'.$this->eventId().'"}}';
        $rs = $curl->post($url, $json, 3000);

        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/initializeLeaderboard';
        $json = '{"data":{"eventId":"'.$this->eventId().'"}}';
        $rs = $curl->post($url, $json, 3000);
        
        // 购买蓝币
        $url = 'https://latest.live.acr.ubisoft.com/api/v1/purchases/Daily_TLEEnergy_150';
        $json = '{"oldQuantity":0,"wantedQuantity":1,"currencyType":"HC"}';
        // $rs = $curl->post($url, $json, 3000);

    }

    function getMission($nickname)
    {
        
        $token = $this->tokens($nickname);
        $curl = new \PhalApi\CUrl();
        $curl->setHeader(
            array(
                'Host'       => 'latest.live.acr.ubisoft.com',
                'Content-Type'       => 'application/json; charset=UTF-8',
                'Accept-Language'    => 'zh-CN,zh-Hans;q=0.9',
                'Accept-Encoding'    => 'gzip, deflate, br',
                "X-Unity-Version"    => "2020.3.40f1",
                "Accept"             => "*/*",
                "DEVICE-TIME-OFFSET" => 0,
                "User-Agent"         => "AC%20Rebellion/104382 CFNetwork/1335.0.3 Darwin/21.6.0",
                "X-SAFE-JSON-ARRAY"  => true,
                "Cookie"             => $token
            ));
            
        $url = 'https://latest.live.acr.ubisoft.com/api/v1/extensions/gauntletEvent/info';
        $json = '{"data":{"eventId":"'.$this->eventId().'"}}';
        $rs = $curl->post($url, $json, 3000);
        if( $rs ){
            $r = json_decode($rs, true);
            \PhalApi\DI()->cache->set($nickname . 'missionIndex', $r['data']['missionStatus']['missionIndex'], 60*60*24);
            \PhalApi\DI()->cache->set($nickname . 'missionId', $r['data']['missionStatus']['missionId'], 60*60*24);
        }
        return ['getMission', $rs];
    }


    /**
     * 红盒任务
     * @desc 红盒任务
     */
    public function mission()
    {
        // 最简单的处理方式
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: *');

        $nickname = $this->nickname;
        //        $token = $this->tokens($nickname);
        // $mission = \PhalApi\DI()->notorm->actaskmission->where('nickname', $nickname)->order("id DESC")->fetchOne();
        // $missionIndex = $mission['missionIndex'];
        
        $missionIndex = \PhalApi\DI()->cache->get($nickname . 'missionIndex');
        $missionId =    \PhalApi\DI()->cache->get($nickname . 'missionId');

        if(!$missionId){
            return $this->getMission($nickname);
            // return $this->eventStart($nickname);
        }else{
            // return [$missionIndex,$missionId];
        }

        if( $missionIndex == 10 ){
            $this->getWard($nickname);
            return $this->eventStart($nickname);
        }

        $start = $this->missionStart($nickname);
        if($start == '任务成功'){
            $end = $this->missionEnd($nickname);
            $this->getBoons($nickname);
            return array($start,$end,$missionIndex);
        }
        return $start;
    
    }

}
