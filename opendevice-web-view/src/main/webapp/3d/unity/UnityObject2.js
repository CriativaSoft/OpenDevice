/**
 * @fileOverview 
 * Defines UnityObject2
 */


//TODO: No need to polute the global space, just transfer this control to a 'static' variable insite unityObject! 
/**
 * @namespace 
 */
//var unity = unity || {};
// We store all unityObject instances in a global scope, needed for IE firstFrameCallback and other internal tasks.
//unity.instances = [];
//unity.instanceNumber = 0;

/**
 * Object expected by the Java Installer. We can move those to UnityObject2 if we update the java Installer.
 */
var unityObject = {
    /**
     * Callback used bt the Java installer to notify the Install Complete.
     * @private
     * @param {String} id
     * @param {bool} success
     * @param {String} errormessage
     */
    javaInstallDone : function (id, success, errormessage) {

        var instanceId = parseInt(id.substring(id.lastIndexOf('_') + 1), 10);

        if (!isNaN(instanceId)) {

            // javaInstallDoneCallback must not be called directly because it deadlocks google chrome
            setTimeout(function () {

                UnityObject2.instances[instanceId].javaInstallDoneCallback(id, success, errormessage);
            }, 10);
        }
    }
};


/** 
 *  @class 
 *  @constructor
 */
var UnityObject2 = function (config) {

    /** @private */
    var logHistory = [],
        win = window,
        doc = document,
        nav = navigator,
        instanceNumber = null,
        //domLoaded = false,
        //domLoadEvents = [],
        embeddedObjects = [], //Could be removed?
        //listeners = [],
        //styleSheet = null,
        //styleSheetMedia = null,
        //autoHideShow = true,
        //fullSizeMissing = true,
        useSSL = (document.location.protocol == 'https:'),  //This will turn off enableUnityAnalytics, since enableUnityAnalytics don't have a https version.
        baseDomain = useSSL ? "https://ssl-webplayer.unity3d.com/" : "http://webplayer.unity3d.com/",
        triedJavaCookie = "_unity_triedjava",
        triedJavaInstall = _getCookie(triedJavaCookie),
        triedClickOnceCookie = "_unity_triedclickonce",
        triedClickOnce = _getCookie(triedClickOnceCookie),
        progressCallback = false,
        applets = [],
        //addedClickOnce = false,
        googleAnalyticsLoaded = false,
        googleAnalyticsCallback = null,
        latestStatus = null,
        lastType = null,
        //beginCallback = [],
        //preCallback = [],
        imagesToWaitFor = [],
        //referrer = null,
        pluginStatus = null,
        pluginStatusHistory = [],
        installProcessStarted = false, //not used anymore?
        kInstalled = "installed",
        kMissing = "missing",
        kBroken = "broken",
        kUnsupported = "unsupported",
        kReady = "ready", //not used anymore?
        kStart = "start",
        kError = "error",
        kFirst = "first",
        //kStandard = "standard",
        kJava = "java",
        kClickOnce = "clickonce", //not used anymore?
        wasMissing = false,             //identifies if this is a install attempt, or if the plugin was already installed
		unityObject = null,				//The <embed> or <object> for the webplayer. This can be used for webPlayer communication.
        //kApplet = "_applet",
        //kBanner = "_banner",

        cfg = {
            pluginName              : "Unity Player",
            pluginMimeType          : "application/vnd.unity",
            baseDownloadUrl         : baseDomain + "download_webplayer-3.x/",
            fullInstall             : false,
            autoInstall             : false,
            enableJava              : true,
            enableJVMPreloading     : false,
            enableClickOnce         : true,
            enableUnityAnalytics    : false,
            enableGoogleAnalytics   : true,
            params                  : {},
            attributes              : {},
            referrer                : null,
            debugLevel              : 0
        };

    // Merge in the given configuration and override defaults.
    cfg = jQuery.extend(true, cfg, config);

    if (cfg.referrer === "") {
        cfg.referrer = null;
    }
    //enableUnityAnalytics does not support SSL yet.
    if (useSSL) {
        cfg.enableUnityAnalytics = false;
    }

    /** 
     * Get cookie value
     * @private
     * @param {String} name The param name
     * @return string or false if non-existing.
     */
    function _getCookie(name) {

        var e = new RegExp(escape(name) + "=([^;]+)");

        if (e.test(doc.cookie + ";")) {

            e.exec(doc.cookie + ";");
            return RegExp.$1;
        }

        return false;
    }

    /** 
     * Sets session cookie
     * @private
     */
    function _setSessionCookie(name, value) {
        
        document.cookie = escape(name) + "=" + escape(value) + "; path=/";
    }

    /**
     * Converts unity version to number (used for version comparison)
     * @private
     */
    function _getNumericUnityVersion(version) {

        var result = 0,
            major,
            minor,
            fix,
            type,
            release;

        if (version) {

            var m = version.toLowerCase().match(/^(\d+)(?:\.(\d+)(?:\.(\d+)([dabfr])?(\d+)?)?)?$/);

            if (m && m[1]) {

                major = m[1];
                minor = m[2] ? m[2] : 0;
                fix = m[3] ? m[3] : 0;
                type = m[4] ? m[4] : 'r';
                release = m[5] ? m[5] : 0;
                result |= ((major / 10) % 10) << 28;
                result |= (major % 10) << 24;
                result |= (minor % 10) << 20;
                result |= (fix % 10) << 16;
                result |= {d: 2 << 12, a: 4 << 12, b: 6 << 12, f: 8 << 12, r: 8 << 12}[type];
                result |= ((release / 100) % 10) << 8;
                result |= ((release / 10) % 10) << 4;
                result |= (release % 10);
            }
        }
        
        return result;
    }

    /**
     * Gets plugin and unity versions (non-ie)
     * @private
     */
    function _getPluginVersion(callback, versions) {
        
        var b = doc.getElementsByTagName("body")[0];
        var ue = doc.createElement("object");
        var i = 0;
        
        if (b && ue) {
            ue.setAttribute("type", cfg.pluginMimeType);
            ue.style.visibility = "hidden";
            b.appendChild(ue);
            var count = 0;
            
            (function () {
                if (typeof ue.GetPluginVersion === "undefined") {
                    
                    if (count++ < 10) {
                        
                        setTimeout(arguments.callee, 10);
                    } else {
                        
                        b.removeChild(ue);
                        callback(null);
                    }
                } else {
                    
                    var v = {};
                    
                    if (versions) {
                        
                        for (i = 0; i < versions.length; ++i) {
                            
                            v[versions[i]] = ue.GetUnityVersion(versions[i]);
                        }
                    }
                    
                    v.plugin = ue.GetPluginVersion();
                    b.removeChild(ue);
                    callback(v);
                }
            })();
            
        } else {
            
            callback(null);
        }
    }
        
    /**
	 * Retrieves windows installer name
     * @private
     */        
	function _getWinInstall() {
        
		var url = cfg.fullInstall ? "UnityWebPlayerFull.exe" : "UnityWebPlayer.exe";
        
		if (cfg.referrer !== null) {
            
			url += "?referrer=" + cfg.referrer;
		}
		return url;
	}

    /**
	 * Retrieves mac plugin package name
     * @private
     */
	function _getOSXInstall() {
        
		var url = "UnityPlayer.plugin.zip";
        
		if (cfg.referrer != null) {
            
			url += "?referrer=" + cfg.referrer;
		}
		return url;
	}

    /**
	 * retrieves installer name
     * @private
     */
	function _getInstaller() {
        
		return cfg.baseDownloadUrl + (ua.win ? _getWinInstall() : _getOSXInstall() );
	}    

    /**
     * sets plugin status
     * @private
     */    
    function _setPluginStatus(status, type, data, url) {
        
        if (status === kMissing){
            wasMissing = true;
        }
                
        //   debug('setPluginStatus() status:', status, 'type:', type, 'data:', data, 'url:', url);

        // only report to analytics the first time a status occurs.
        if ( jQuery.inArray(status, pluginStatusHistory) === -1 ) {
            
            //Only send analytics for plugins installs. Do not send if plugin is already installed.
            if (wasMissing) {
                _an.send(status, type, data, url);
            }
            pluginStatusHistory.push(status);
        }

        pluginStatus = status;
    }


    /** 
     *  Contains browser and platform properties
     *  @private
     */
    var ua = function () {
        
            var a = nav.userAgent, p = nav.platform;
            var chrome = /chrome/i.test(a);
            var ua = {
                w3 : typeof doc.getElementById != "undefined" && typeof doc.getElementsByTagName != "undefined" && typeof doc.createElement != "undefined",
                win : p ? /win/i.test(p) : /win/i.test(a),
                mac : p ? /mac/i.test(p) : /mac/i.test(a),
                ie : /msie/i.test(a) ? parseFloat(a.replace(/^.*msie ([0-9]+(\.[0-9]+)?).*$/i, "$1")) : false,
                ff : /firefox/i.test(a),
                op : /opera/i.test(a),
                ch : chrome,
                ch_v : /chrome/i.test(a) ? parseFloat(a.replace(/^.*chrome\/(\d+(\.\d+)?).*$/i, "$1")) : false,
                sf : /safari/i.test(a) && !chrome,
                wk : /webkit/i.test(a) ? parseFloat(a.replace(/^.*webkit\/(\d+(\.\d+)?).*$/i, "$1")) : false,
                x64 : /win64/i.test(a) && /x64/i.test(a),
                moz : /mozilla/i.test(a) ? parseFloat(a.replace(/^.*mozilla\/([0-9]+(\.[0-9]+)?).*$/i, "$1")) : 0,
				mobile: /ipad/i.test(p) || /iphone/i.test(p) || /ipod/i.test(p) || /android/i.test(a) || /windows phone/i.test(a)
            };
            
            ua.clientBrand = ua.ch ? 'ch' : ua.ff ? 'ff' : ua.sf ? 'sf' : ua.ie ? 'ie' : ua.op ? 'op' : '??';
            ua.clientPlatform = ua.win ? 'win' : ua.mac ? 'mac' : '???';
            
            // get base url
            var s = doc.getElementsByTagName("script");
            
            for (var i = 0; i < s.length; ++i) {
                
                var m = s[i].src.match(/^(.*)3\.0\/uo\/UnityObject2\.js$/i);
                
                if (m) {
                    
                    cfg.baseDownloadUrl = m[1];
                    break;
                }
            }
            
            /**
             * compares two versions
             * @private
             */
            function _compareVersions(v1, v2) {
                
                for (var i = 0; i < Math.max(v1.length, v2.length); ++i) {

                    var n1 = (i < v1.length) && v1[i] ? new Number(v1[i]) : 0;
                    var n2 = (i < v2.length) && v2[i] ? new Number(v2[i]) : 0;
                    if (n1 < n2) return -1;
                    if (n1 > n2) return 1;
                }

                return 0;
            };
            
            /**
             * detect java
             */ 
            ua.java = function () {
                
                if (nav.javaEnabled()) {
                    
                    var wj = (ua.win && ua.ff);
                    var mj = false;//(ua.mac && (ua.ff || ua.ch || ua.sf));
                    
                    if (wj || mj) {
                        
                        if (typeof nav.mimeTypes != "undefined") {
                            
                            var rv = wj ? [1, 6, 0, 12] : [1, 4, 2, 0];
                            
                            for (var i = 0; i < nav.mimeTypes.length; ++i) {
                                
                                if (nav.mimeTypes[i].enabledPlugin) {
                                    
                                    var m = nav.mimeTypes[i].type.match(/^application\/x-java-applet;(?:jpi-)?version=(\d+)(?:\.(\d+)(?:\.(\d+)(?:_(\d+))?)?)?$/);
                                    
                                    if (m != null) {
                                        
                                        if (_compareVersions(rv, m.slice(1)) <= 0) {
                                            
                                            return true;
                                        }
                                    }
                                }
                            }
                        }
                    } else if (ua.win && ua.ie) {

                        if (typeof ActiveXObject != "undefined") {
                            
                            /**
                             * ActiveX Test
                             */
                            function _axTest(v) {
                                
                                try {
                                    
                                    return new ActiveXObject("JavaWebStart.isInstalled." + v + ".0") != null;
                                }
                                catch (ex) {
                                    
                                    return false;
                                }
                            }

                            /**
                             * ActiveX Test 2
                             */
                            function _axTest2(v) {
                                
                                try {
                                    
                                    return new ActiveXObject("JavaPlugin.160_" + v) != null;
                                } catch (ex) {
                                    
                                    return false;
                                }
                            }
                            
                            if (_axTest("1.7.0")) {
                                
                                return true;
                            }
                            
                            if (ua.ie >= 8) {
                                
                                if (_axTest("1.6.0")) {
                                    
                                    // make sure it's 1.6.0.12 or newer. increment 50 to a larger value if 1.6.0.50 is released
                                    for (var i = 12; i <= 50; ++i) {
                                        
                                        if (_axTest2(i)) {
                                            
                                            if (ua.ie == 9 && ua.moz == 5 && i < 24) {
                                                // when IE9 is not in compatibility mode require at least
                                                // Java 1.6.0.24: http://support.microsoft.com/kb/2506617
                                                continue;
                                            } else {
                                                
                                                return true;
                                            }
                                        }
                                    }
                                    
                                    return false;
                                }
                            } else {
                                
                                return _axTest("1.6.0") || _axTest("1.5.0") || _axTest("1.4.2");
                            }
                        }
                    }
                }
                
                return false;
            }();
            
            // detect clickonce
            ua.co = function () {
                
                if (ua.win && ua.ie) {
                    var av = a.match(/(\.NET CLR [0-9.]+)|(\.NET[0-9.]+)/g);
                    if (av != null) {
                        var rv = [3, 5, 0];
       A}6�.;6k�উD_��zM��[�|���k;Ð�W�+i�6Ѭ�F�����X���(`P_��~uR�[I��Ο�O�;|#�nk}M����'o�W�9`T����}��ʎk�i� �����T3�,	}��TxFs
Y9�4W�U��X�+t�)��p
���
��~�f����H�,}�fM����r�n�`_	���W�N�9�P�Uq�ۑU��9�̠
PqBVB/���J��+>F�SJ��M�n����OKz�
h�����w��#]�b��\qO�$
vU���G���v�b*P"w�yڢV�	�Eɂ��Z�U^��#6��wެ��j�?�����<�^"O��y>%���?��=�ɹ�?�'��t�������M���\?J�ō�����^)�<�s
t ����U����l/~#(�T� ���?A�AW"�x�y�Z�@=P�$�c�����tGp��SĖ�#1:NDg՗Q�΁��� ߄"��D��\U�7����P����v��.`u��*�`iB��C��O���w�oPH
?48!(5�+��sgbzNx�@?�U�:��?������K
}����=.l��@Ľ���KT^�����Z
���,K �$JU>^�VY��|0�)�_�ڣ��@��A�5c�X�Z�j�1�Z,�% x�$���`w����p{TM��vQ�i.���`C���<����į��P^����0}��⍕)�?V>�W�+k-���rRד
�c};>?�GX��G��\{$�%#w6���ϤHuT�|�M�	F�޾�=Td价��?&�l�]&���u�H�~?��|G��2���U�������=ӂ=/���f��2�ߟ�0�e!�������Bܦu_}T�g���������^%]��
h����/V
i�t�tP8Q�j��IV�mi�u�Ҏ���轪�Q^�,	(�4�GGKh� '�)FaC�9h�:4�&6�_�kuU�8:ud��A0����
Z�J f Z��E$�
�#Z&�ѤmUP��mUH�k>��*��A��01�
�Ҕ��S�#��+Eem�������Ǫ��A�N������#~�aM%[��JT��(*���C��QI��8"/�!�i��$$�H�z7��k*��
�	"R��q�J��<�!��w]�ii:芓��EE.��Ag���-H�3�� n��/tz*��D4�z�i�}%x"3��oU-M<pex�D�K���{#r���a�::4`�.�E[(x"�@�e���u�L	8JԜ;)��1�ᑂ�IDS�:(,�QU�Q2I�H�d�����)֥vN��t��D ���FA�F��(�|
f�8����GN�������v5�!����
�[��n/{���U@�6 j�'�I�5>��F@�?W�jF	��֨�0�m�FG$4�����x
��)a(�1����84{��J�bN�3Z n 01wb�  ���d�N�,�T��*a��M�KFl��A=�ih�
���~(�LGi�M�S�2�P�ԜF�P��[~c<#ˡ�\�$SXX�AH���63�+l����;`%7���,�`i�Z����CH���P�L}^������T�˾٘x��L���"QlEB�+�.&,�^b�|�P1t�fE3>Z���!�#�����D1���a1gF/�;�"� 
NP u�a�Ҁ	@�F:S��0�t����Ҙ+�Ȝ"L)�X ���$�`'��V��g��$��G�L�O2��X�֬�%,��0C�� �qz,��Z-�
301wb�  ���d�?OS�fNʗa�:�IFl%�*�և/����i�Jv���ʱa���� }.�N���u"L�'���z�cd� �¸�h�дF���sR��!p`jL �
�P�5J���n\ f��a䴩;5�A�HT*�+^'�U�A����UW���/�9>�������c���qH����3��2\�w�IYdI� xAu<m�Q��,"�i7�v�2�ps�L�-�i��@�)#}�3㕺n�QN�wyP���2���\u��F|�Rq�vڊ؄9�omt>I�j���G!����,��qǈ� @��YC�kIQ�$F;@/��(&��@r�`��H�,�G2��Y��Qb�X�2V�����Ø�����fpL𼒞�(O�@�����Ⱦ�KQ�R�D������x&}	�ś�6u�$�^�w�������j4(QwE%�I"��r�F�Z�݉'y�.�Sc�\xPNBHFl�M�w�d��00dc	    �� ,�_�ӯ���!��iZ����j����3*um�oW����z�B~�~�^�xE[TtR����k�Tj7{�"6�N��@%�7�$Tb��:o�n��AQ-#$R�j���x�jo�Eo��0��E�����J����^�0GN��];]��u�+km6�$nCW��M�4D">�O���IL;��QpTox�.󧓦_��m:i7OH]A,��J�׺(���`}0Ӌ��`h;#�e0����t�_����M��@�z�&�:t����h饦��U�D{�&��ؠ�'��+ύ�����
_	�bs�����g|x�7�� �R�GO7T
��`�
�I6C4ސ�P
+�c�.a;�l���R	�'eJkfB��H�xhx㨤D3+ƅ�������G|h`t���ZN�|@�����t`a3��#+�A\8���x<I�<���-Y�zV&�x����ppU+t�6��D4W���V4��j�H�fI��G�	�BA�+�	9Qq�Kun���7	����Hz�ޝ�x��uW��KGPQmR�=-�B];r�k�$8I(}�ҙ�]�.��Քڥ��&x���|,Ʃ�;��Q��i
t��mw�j�z::��ZD�&�D'x�y^��t��
Ug��5g�7קN(7�
z(􂤝3J��Tt�\p�I�ed�H��D�0���U�R�c�!�F�Y�(,�pt�⁶ph[T�>�&�,�s�ӧP;^�t��B����L�aP�]N(�f�e�д�v8|V���S#x2�0�����hm��P�Ke`�I�7��=��� �m��j�a"�$$
����w�1V�0)�*�OHq@jw�f��$⠅3;�V�o!��?w��I� YzyF9:U:�BʨC����|4$�������V��pU��R�7�4.8Z�Fv�"@�3��B+W,Dۘib���E�b�jp纋��f���4�R$-O�P=�O���a��y�=���4�zt�����#�+C����b1'���I��ld�"ॶ���>�	����uv"U��!Bb�1���h1�Lt�޲c�F��K�`��|an	�F�][6mpd>�^�8L�s�/J��-�H1'��%��@�	
&*����!�K�C_LE[�HH��*�H/HEJXâ'���D�.���Xpญ���<*/��L��d�l=.��v�恀�E�K�%%�
8���`?>x������8�Hp��p���h|� LS�ht^�>Bs���HT�ڳ�Pa�x(2�0�VqB�rN�c�u��B���DpTwJ��6��'�ԋ��Ƀ��\,��0��i�FJs�d8�bj�
�Vz��;���)�z"2�ke]5�@��F����5�!����fP�	���1�y�)�E�̡���waY���͈�J
���'� P0g!$����I�P���t�Px�p�}60 �w �AWk�B�(���V�H`"='

$Q�_���̉��
 ��Q5"�J����C��HE��P��01wb�  ���d�)N�;�I�
�1C���K@l�@�l��

ɖ�X�%Kk���{�-�DbidZ����5�o��QdFͬ�@�:�Hfu�����[U���w�W+�: ��� 30Kv� ���h蜦#�P߄���@�t����U��(��G���E�G��h����~qɉ�r� i+���8�"!@�MɤH�y�4ޢ��-`=k�ֵ�j���
~��3�
2�����$�� ,`5,ȁ�% Ň��00dc     �T�� 01wb�  ���d��P�xA�=fz�0�f�]CL�1
�e)��!�C��e�80.4јI:E������'V�	pl��f'�=z5
�T]�N!v�Ǖ������Q{`�\z���|R��O�����8�n%��?�V���G�l�l�R�,��`%�
�؄�f�@|�r��q�=���+y�C�Ѝ2-�����^B��P}@��1,2I�k�+�߫@h'
D�u��pRVƄQv���|&6��O��t9i.�x�͘�G4�1D0�'����������us\�����ON���^ڵAf�|�	1�:��-2��>$�c4b��v�Fb��j�)�'4(99y�i}�5Ri�0��N�8X�Q���C�C����Y����;��$���>� \X�-� ��2��L�\i2�"�
ܞ����_�� v3��aU�1��yr�T:��ޒ��c���������8�		]00dc?!    �V�l�0=�}�ݙ�糽��ks��ϵ���cl�e!W���Ѳ�	X���o!U]�fp�K��%:����}���϶DF�Oh�i��+<Gm=�����|z3��_��� q�d3xb_�۠a������o{����<�x*q�S��}��������l@A��C	G&<�7c�:�4�O�y<��KrA��=�J'[[}6��#+:c��<���z~�q>�l��=��n��8�9��BcL�3�,yN+}>��o�������`y�Z%t��	����C��~���¤Z'��I�V��5�z>�}��{��s[�}���-��i��*��^ϡt�סo�01*v��22�B�
�bM��X����x���Nģ�ފ.ō��"ܔ��̧ޛ5k�ہi�����)���Xf���s�l�P��x��^�ُ4<�eS�-dN
��pȰP�}ꍝ�4���$V��lEzn��gp���O��U,\�L:�Í{'�b��SKJo�)K��j�;�F��� ��������$#�[�6�YΔ
�y�g���(4y��p(3�_Z�m�������Q�L�T�~Gi"o��0kӏQ���BC�rҎ����4b9�􎤬;�����"kOFID>�p�&�O���4�M���鍤)�T��ֈ��n��am>=�ҷ�c�ªػ��L7
�te��&��̓d�)��)0���ݷd�ń�);ZAV���X�i*�����$8ҝ0�'%0��y�x#V���s[�Jd���8�l�W�PI�
�c]�w��0By��
�	n���!�ӇP��3�i�u��Irzp��G3&�]LdR��� ~t��NltR��κUI��Ӯ�MG)M���t�m��c/�o ^�{��r� @CXt�/�*oE��ǚ��iJ�n��Imt���m�C[ �F��Y�{�L'R|�f�N˦dT����`�Β~����K[=V�B�];O'�;ץRz��yh�e^��~V��.���/"�3�h�/{��Ө�����p�	C0�7��SH��8q]�t��76L:���b��҆RJH�!>s�zxF	��1�yA��/��'`�i� 	^�[d!�,�c��?,�y�M:����w>��>n�f�<e�rFz�I�f����$��U�0����͜##�e/�_OhU��=����d�!2���+��2�t�g4�e�~����r�<LC��Xi�;���ҿL��n?��ch��wZ�I�=��لU	`�z7Wxf#�oxf�F|A�{�`��ѓ_���.UA�@ F0�uLq��v9;�y��>�8C���5<F��@%
nr�>C�d���ָ����f��iwf2ޘ�RO��?�����d�1�SXXpF?�)m�=A��[���	���7���`�e;�o��V>�ջ�A���/A #�G����R������3�uL�23��ۣ�9�gM��V{ޭ
��>M��
M�'6#��������l2� ��#���^'�1j��SqP���h�꼣�*NL��; ����#\:F�DV��ϒ%�4z"�aEZ�FL4g�̌t�)ѿ��ک��va��g�����������1+��U~N���i���zU�׼��V�%�̏�ײ޻�0S�J�#� �o�8C���[�=Fw����s�N�ʟ��|�^��
���H}�M8.����\����<"��:zx���)Ɋ����W�m�9��͒�N�Z5�x�-ns�Έ�
G ��ݺ��o�>�r!9���X��s��4~nˁ���Z�D`�J�ZӃ
}�*�罰Rw>�#O�ۂ�q��pd���)j��H��H��u��%�g�l�8��{��� _"�X��.�]�˗���x!��$�3^�i����r{R��X�Ofu|�0��#\
i�?��0�_X%
t�LWDnO�����_�v(� X����Ǝ���]� �0�2�,�,Rе+�|i	�Jh)��X�5��+	�ȃr����X�_�7F}�X#�S�z�X�n������KQ�K���e��h�U�s���8�� /|�!�c���D�+��F"*��W��[8F
դ	;�Z1 �<�Չ?�{j'o垑��l����������_̩E���clSsy�s:2#O��81*e�
U��;���kb{ƷyQi�"K2�������n�;}�� gI��'���[f��_V+�����0��=@�Z�<,�	���t�)�>N���5���/�ى�R6��O�Y���������{}V�C9�[S=���{��Q;z�ƓOɯ�禍2��2�`NE��ƚ�t��.��XJ�&|>#�~�k��	��ivI~#f���
�F�'SP��,�gʟ�����.��]��u��O ��{�.����/��zUE}y���S��ꮙ�e8�	��&��.<4�J�;A�`r����*����ij��UX:}���:d��ӓ���$�;�?���)��_�L��,##Me�}>:U�R��okZ���-�qB�+d^#L��}ZN'�&/����@&AG��,s�:����UW��o�=G�<)S�>�
����ڽ�5�X��VnjC��*��q�����=�5�Y|�To3���X1X^�Sc����	�Y���a����xw	ey����ҙ�ܢ�/��=��n1��0���~�������ǽ�R@�j���ܔ[�[8�YW
�@�����(.��\8_[<#
?�R����P�_��L=�L����g܍�0d	��:��ޠn������F.��� it�<>,��H�4� a�S<H1-[S��C(���f�@�_�����~ꟴb�Io
	�����*�<�;���|�|�o1!����5lu�H�N�NJ�P~�%+T>��xs_Tϫx�|^:����upW��˳�~P�:���t�SϏ�� 
pt�F�c��]d�!�V������	�v�f�K��nkW`��Znp�}3�N~�q	Ӿ�\��]�6vϋ��wѿ1['Wwސ&�ܱB��e�៱��=� f���8�ѷhUb�`���ܶu%yy�����j.+6�3ٶ�L��}9e��A�}DuR�PQ\(���#@Cnm?};����oE�N��{�]j�c��(���|��Zԇy���b3��{���+H�F�o�#�Q�戥�/G|i��g�m~^+���!UǙAE��H���@=ǾTY�"6V����cs�*d�4ы���i������6�)��R|S���v�[�k�3���
���;6I�fD�
)����p\��K.ߗ�
����l�;�����M���1���{>  ��U���G���������M��u]��!�UH�7�������� �<�O
�Ov����>�ܿ �G ��Ԩ�+��͂N�?�� x����t����d�p��	����3���H  �ɸJ�p%��
��H^���6�PGF	���
��RE}�:�oEk�1�EZ�WDѲ�$v�|����!%��!�(��D���ڮ�M��N���G� 87�
>�Fj?��`1�УH<5�`����:�U�Q�7mS�5��(ɆT�X��Y��ϚFF_��;���j�w� \!^�XM_ţ�Y�>��/�<|����?y��)h�Ξ�� �(�p��p3���x(I=4w;�K�B�l���pA;'<<>�э<,>�NP>+!��
�X5�x��3�h�4.�f"���g�q91���E3
����:TM�D��s��c����8�*�������1�U2�!����g��\
H�@��A<6>�cI��L� @|<L�qߐ
�,4V��3�~S���1(��1�,��>Y�1�P�|5�����X'��Zth:_��`p}5��S����tH
�0TJ����<�8<�/�(b&O�����@,�O� 01wbP  ���D)���EVQ�S�^�g`�v�L�Fl�%�_�*����@�Hh�R�N[hH�� �B�������7C���$��^��3:�jl���k�r&:ȹ��ۙˆ����vUī�]EC�_������\�{K:6����v(~����Jl�v$�'�L��V]�� 6i#i��
YP�9�tH���<�|��;Jg�s�bh
ͼ�7	I���k�r�g�f��NY   
!:���P0�F%���x�) bc�AK!R ��$���j����_ر��f���$�X��?��,(2�rK}���ǰ�^���J�<D�WG"&:����1��Q�*�n���z#U{S��ٛ�Q��G�k��>�W3?p�)I�����X�a�`�Q�2���]����?����o�32�������}ר���?:~�JH�00dc�    �� ���z}���ON�� 9��&�ސ�ߣ��G���-(�A�x}A��IW�B� r�)��?���N�! *3�w�Me�����րH�U>�e���r��_���(����(����[k���G$g��
��q�	PC�E��h�ǆ��0 ���_N����M}J��`�#��|2<*8�'b�<|P=O��Ai��`o'�t��`���	�.tY���|��
�ç:z�5�G�T�I����mD�@5=��4�4��i 0g�T���C�"VoV0�D�>�(��>`�<(��}5�
����Oơ��!�ҠnFaQ(�������������U�a0]��`�D��ꉧO*7��<�i��Ꞽ��"�@�� n�y}z
z:�E,?�WMdN�c���6�r1�Ϣ�7�,-<P�J2=%l���f�BC��Au8`)��m��V���HpN3D���~�*@�p07���uϧZq@�o>nß����fpK7�]�궔��B�JN�������ۧ��d�1�P�,H�s�8�EP+:"(f�`�E6�p�D��OH�8�a{�2-�#���O��xh}���,i�
�$'5p��3M�2{�*3���ѧ߳t$H)O�si�Dψ�.(:��-�C� ��`e���p���q�;�u�Â�?y�'���ɩ�W0||xR�ތ��>�V
�1���6$�F���?0g�������A����� �	��O�>x�gthp������zX�E��@<��L;�3F2}���ri�`���]����`X}��k���M�ր��F��H�L�����|g��*�W���:�����68V	E�'�;��c���d���v���W��|[��.֫2�P�� '�m[��>�t3OPξ8���U9 pӥ��l��c�,G{�$PQ*�p�j���ʜ�d{[x��
s��N��
�G��h��z���8��Y��F{<�Ҟ�izmQ�[4P艏<8��m��p"��㤱b|�������C� c$�u�~�<iP����HΤa��M�b��}�<>�},v6H���b��S��z#��S4,��,����ͱ/Ŋ{�&���Ĭ�x�[�%a�cF�����n���-fXdG��|J&eZ;�7�����t�-�.4�*����L9��A�qa�r�?�N���-]�pt�v��i_01wbP  ���d.{LV��3~R�:�<Ê��=aG�e95gɖ�Nٴ�h��.zG�V���;����\���C������H��b���_&��sӱ9��f5�����<Mp���!�b�׳d�U���R:��Sr9�_�����)P�;���BlMd��+K_?���lY�H����d�C��&�jc�v��Gi�Ai�Jo��3�[�Ǻ4T��t�Ϸ���K�(�Ŏ�V�;����1h7w� <35M:x5P �� �;�B$��)�i��,�9c'}qC�� h���̞��.�o`�bL@&8.�ϱV�Oa�JV��jm@����y���0
,�U�����01wb�  ���d ��N���+|N�zSa(X�uM_,k�<h�����>e��	��e�x�iF��-�ԟ��=פ�H 얽6�Î
{��G
��hQ���P�*�F�|�@$`j@�Aǋa�{4�]ܨ
J. '-ܷ�puq~%�Z�(Q400dc�>    �X���PR�}��y�Ŕ��B�����9A���g���s���1�+\� (�>�$1���	�����xE��т�@M>Na=�ɘ�၄I�'!Ч�N�d�#7�1�����}�v��Z��H�%��7p�lfO����^����Jɢ;t�lc��,-�5�J%>�����V�E�0�ýh6�w-����G����uU,��c�*�Q@�>�g��
\!õ����hK{Ŏ
���Vs������4󆂇����A�Ck���-��2r����	�6�9
=ﻀ��+F�o�l�£�\�#���)[�m���RG����7p
k��i��.���
�I��z�Ŭ��b�e��[�g{���&��7Zӟ���o+�����<H��X�( �JR�-���`)ؚ�p�H����:��� �J���]����r_��(A�`�>������83a�CW��!��ZѾ��r��Y�us�#��O�8�U�iD\X�*�5�'`�nf%�����s�M�Jn�x���=.T�2����d$(K�
�,���s�@�BT���z�D��P�r�d�Ӗ]�	2��@Ik�5g��ŠN��pG�X�ұ�LH���QnJ3xS,w9��cȌ��@�(�G��B�	}*�'�(kkt�Q��8�}����
f��ɟ#~�.#�[��`�N�H�X��`�He
�G&�JxBܢ�=�pdݜ��0�a��_#񴔩�2K�$M!���s�/aǽZp��F��١��;����K�hԒ���
�NsB+m6ӒkZ�����0Q��%_չ	������A�'�y��Jz�BoWa��NI���}͒p��bbc����R�3ƈ��(�:w�N�?W��s���!�W�ސ���l<�wZ~��Ɉ�z��biϲ����}@c�(<GJw��uOӝʥ,�&����=c�����:+�������j�i�m�TB�a_��b	�gs5�����3�V{ݠ��\/���|�uE�G��dE֡ۼ�9�����>j�"
<�ٱ��|��k'��<�o7,T��� 1�����	�xzi�������Jۂ��z�N�R����!���o�	ê���W��J��2�~k��N!�������o��`$e=m��'�����D>�1OscD���p֝2y�9���ҷ�zб�4��7D�d����c��Iܘ*	b�&�k[�H�������MѨ�Y��x�j0v0vXh���̢�/:D��Le�Z#I՜a~2x���Q�+�k}HM2�*!�p"���X�%�i���Mgf�b;%}*-�e�e��N@#�6t�5N=-��O��	S�ʟ&oy�n�,&������z_��݆�}�Vu2����lV��^d;&�=S%��3��G�o82�-SOpV�,2t�|FVɻ7M����*�y���W8K�ϒ��R�}#�$z^�܈#s��J�#�������6�Շ�"W�A6/���|dKM�����0XJ.��q)�?d��;��Ć��9��3��i�9��q/���	�-&�L��be��c�'zw��r$�x��h۵�E�S�F�Dh�0�6o=�,:�J����
v���E�:�__�����p�Ԉݟ���	��@"���8]T�)�V�X���ob�5��k��:7�%o�QsZA��
߿����q���O�}x��Y퐵��f6�X ��c~��T�*Sf�4=k����g��-�e/�o�A���T��}��ʍ����<��G
5�g�n��H#��-�g*���;RP��ѱ�3q��M�cAO⋬'u��.J_��j -C�ۈ�h]�O�>��xytG2��TB����Dt���g�L� )��wf ���(�����V�� ��ď�r�U�ۢ��{��[��.pSF���~#�ߦ����d\�!�8m���C�i�K��А��9�{�[в�o!��i-
z���F��a�i[��̴c|�eXDB#�Jѹ�Lt�'�q�,.'5��nS"=��Ԭ����yɦʜ��U�r�Zt�@qa�S���J3�{Ռ�ﭺ��9Ol������9!��x]�*�/*�G~&��tS��,W��͐l�I��n��K�;g�Yz�F�y��7sD!��s�|L9�.%���(5/
� �zn�*}���NPD��0Gj���J���3s�[�3�0@���!�.� �sR}W����Q��؂� c����T�O{	��J&L��H��kO��� �<E�`�[�?�lh0����v�b��ʧ
b(�;5�T��&�T37\ʾS�<�o�<:�F��������p���	=��RI��bh
\��RSخt�s��M���j3�vʉHgb��C#!��~�{Sʼ_�|_���Y1!�������#)���i�D�D��
u��c'JFI���][B�G����<
[�����+�����0��A���撍"�6�&��:�)�F�*��æ�O��h��1� �TRhx���|���X ?�B̬.r�@��� ��H��bi�5��t�Iɕn�O;HV��ns[�?�5�`1�x����ɒ��R.��li{�+׈��(ȧ{���_њ�C×ي�m�iͫ�e�Z��J�C�NN�ի��.y{
)�5SB_�Bt�e>@�X*��pfo@")�煉��ΦM���f"��4D���3�4#t�~�c�!��
P��	U��k��L"M��$�a�y#�(�%�)��k��-<�#թ��
`�:��]:_G���@�L�Je0<
`�����P���}������0�\\>z$���G�Y[0]���*������M�a:�'ԇ����L�ɞ�]h�OC��	��65Z��
����nx/�^�dJsj�`lT�����uX\_�,�h7m0��`\=�`����s�m�c^���{��W�V8CAM$XG'��"�F|F�f��C�o��#�s]?�kp��l����>#m ���,r���u�.����GG���G}PB���`�f,�u޽8ٺ�538�%�sl�ׁ��@':G�؄�)�V8�<᳂��>|]!3y\���)M'�I�9k��'x!6o'�����-02�E��9}�
?(��Ee�8pA,g�Ǘ�)CE� ��a�xm0<v��J�<�a��V^{�iէ��l$�k�=v����󔋣R�&Y��\�Y�8��e;�����;���2�k�h��XW�"��;�#�1���Xi=]�����pnv�1x��Gwf1�J@����B�o�ڈ/�������$���~���EP�CӢX�.��ї��8&�{�;f����k����n���6�		.|�]�+��G�}�j�N����O�6p����2:6[��7*�Quk��J�$0LlA���#���Du.��zz�x�+��r�
�Lb߾w�11.����#
U���^?�AYO�QT�����9���6���x��<F�'�:�{�C2���5��Qi����Ӝ�	�3���=��VS:Pc���Xu�RDF��#8���`��8u���g�(��:I�^#����Yޟ�Ƀ���O�E3XM�u�ny��[�=='J@��<��Z=��ù��zk��Ȏwz:�<<s
���=���q��o|��?�EՃIz������@���&YY���gQ�,;�$n��|64F�Iè�
��W��PIT�%�+��uV��o���MS?��nN
m!�I �2�c�)W$qtW��m�ɖp�Qug��5�o	B����2�#خf�,�n�\~�t���PE�����+�l��#D�@�%6�^\��>LzI�h�����O�Wc�I���O�l��6�b~sC,�oN�G�L
]��S���!J�6[����a�����l��ꀌ2�"Q,Kn*�gC��i��~?���g����(Za#
����U�uc��H�x���u]߅�>��*�u�s�p��O���UC�g����{�n���q5	�*|yv����=����-� Ǩ1A��S�i��iO�}rPR���"aఙ"{���}VؘYK�EJ �����W�8�w+��[/��6�b
�G���������1c���=������ɁUƔ-�`��"�����;~�I�kts�Y9���O���66�H��B��3��O�X= �^U��p��������ؖ7�bUR�I�`j�fL�A��ʭ��vh��rj�O>
R�nXyGH��
�AE����~��X$���u@�IU
uA��b����uʼ=fb=�%��,���ݮ����6�'�x�P�d�X�!=��1��;�"�hh#�Aҕ��*+i�ँx����<�a Q28�VZ�`�D�]`���t������)�I̶?dw�aB�"?�ފ)�#�+�"�����%��HT�J�\#��.�b��^:k��8t���'6m�qW_\;!��spb#�YV�OR����{�y�Ĳ�r�򛏌;��N ���D�e{@�e�1?ߒ)i.�RwүdX���\�����c3TwZ����Ĥ?�?7ɂ4ρ���Yc���O�w�@��w��S�3�(�W&��i������x��_�����I6�Ygq��N)��l����'@Z��q�*����mE� s�V�
5z�����;4?:��������vp,OE��}���x�rƔ?��nsY�V����� �/N���9�bC���`a�g���H�V�������[?�]�^���-˫j��
h�7�#�����>:��J@:�{_��ֺ�Bg��Sw{�`�V�kj3��Yw��&��
��y��R�Q����#�m&���<�<� �<�g��@����\��mIߣA�N����]�N���8�#�ځT����wB/5�O�F��Nx������R����q.D�NFҪ��d��H]�o�?�ڡ+�!�\�x�Z@Z�D?>..U����=4�U��h�����K����6�H��ռ��M���MI����l�'������0h?��ea�"��O��&����ͷO�G�rO��̯Sx��w���MJ�$yl.�[xɃ�4���*y�)OH�����z;ƒ�/�h?��A�&����h�G��/].������KuU�:��>0���t�)�X����f�x�<no
g�
�����ؕ��~N6O��h��l�:�ƹ��l̼�M��Wͫol��"o��|�3�������F%��X�4�}X����VU0�,� �]R���NC�c��fw�@rI�����{���.mTQw��b�R�6�K�!��Y�r�f�+�(jt���}�[��r�o��������NHt)�)Q �O���������ģ�^�#4����?��-�f�1�s� ��tU��vL�b�/�V�>?�d�ssrɼ�k�^*U�,�d�7PG�:�_U-}Day���\7,�VXd)�xĚ������\�а�2�F��5�Ҹ=Ch���˄tBpP�1���� W��0�oy���;O����J`
uT\�g���z(?�D�Nom���PC~��e�%!ӄ@S*������}��"��X���7�tFLIU3�Ξ��b}ܜ���@�� 7l]W��a���?Z�m3[}Do�W��������K+oӷ�v���t!�eQ��_j�m�V>W��@�� �V��{՗��8�?DEY<�_�z��8_ ����=��P�xH��C��Qg��v5�U��"Z�� �Do�D����� S�PI��u;��h�f���.nUM�焱'4{}��H�#V^��`��0%�7h�'X����$���G��sN��AJ�
�&��Tm��~��R8"Z��+�8
i�ئ\�Ow���Uxy�����Gz��XE�ʻ�=x�շ��_��rN���wI�CJ"Z?>=�˛�U��y�A,�m����G���(�
i�� t������o��H�\�#^�>�B-y�I)����AO+ĥpE0'4,���|��ͬ/���z
�2�]ܣdxK�ת�������ëQ(@�ɀCT�1�b����w5�@���f�*���x��[�<�����DE�Ƹ�6l֎�TQր�?�]�X"��U�2��=b��&����ʟ�)��Yv��"�ҙF@����/�K��Ա�%$@K�+�� �Y`�}D|7E�� �%����7���D�. ����,t���Au�DZW=��	��}�R����{��)����U�=AA�>�}c�Y�
}�{��zk�)9è��JC1;��烷nkl�n<)��뼯@�;w��E
��j�a��'N�Gn���O���a2�0���l��
x 8 :�zӷ�Q�I�5,�0��ܞ���k&5w3��I6ǂ�~�HIS!Ms	�F<�f_�NA���D/4�Df�� ����:��h~�JV���19yp���)��r��҉���{#x��W�f'=G����?�Cd�F�
h���w�]m�,C}�ؐ�����^*��Y�r]�;�+i�M�`��f����)���3�	pV�kb/@'��Z
^�3�5���~]�����R�X8��7�z�O�P?T;���H��3���^��b��RkG ��{�ٛ0w�_�<��1��M��*�����أ^�1�	R	���F�r����<��"M���U���o<���ں� {�n�i��܇�Y�������]��cB��c��x)�赟Q����.��x�1pӧ��|���]T�
�å��#�Uypa�����XE�0ڕq�hǸ0������?��M2�t2�5��`\�固�i}+�{zٮy�Ph���Eq�99S�)�J�'��P&�\� �����l�B�)v�<���F��3t�b�
�����Mp��J�P0�-�TQ�������N36��R�@C��O��\SZV��4OS�`�4C�s��vF&G81c����D� ��l\%�a_H�"��o3�zJ^\����m�bL�p
h���Y��E�ɕu�a%�ۣ�C
��WZ,Xл����uꞏX]�~����;}X�>�j�ْn)1�TT
�?ߢV�"���L#�)��CJS�b]P3�Y�a��B���������D���GkFJ}XB�á�쾀}�aX�%Q�#jA��lG����(hD��>�˶��~�f��&]�ˢ�a���(�E�"b��n� �U�����cZ���w�a@���XCV\�G���b�=m���<y,����8����� ���
037��,�>C	�Y�⼥�_�v�g�l���G-%��^"�L�����{3da��`�>�?�-���:����n�3T��=ˈ��N���2���P)�萠b���M�,O�":�ѡ%�;W<�B6���7�Z]�U�}��ރ�ޕPX��|M�F?9��/��B��) W�s�B�Q�Ƒ��7﬑=�{�9�S�a�(��\�u��Hh~\>��=�DI������22�E���
F
U]�sH��
m��m�� IW���W�L�V���np꽅�����>��������Q�	Aw���~~U5���bU�m  �|	 x����9��;��c�g�q5"
��̋��W���G�>ܱ��Z�L%	d�0B��.��?<�<|%1�A޴A ���8xlzp	��b��&j�Z�B��zvAR� �~&
t�n^HM��]}{��}���3���w#h�L^<�g�rth�4�����}GpFYd�5K���D�j��(�;�Ptka�SDWU�|w`���R������l���4w����J~������X��ी}=���H�Ɂ
�R[�.�
��!��wG�@���ո��V���.S���2��3��C����y�X!&�6���d�~� �gA�U�Ԗ� ��4�]�g�X�j��(0�_��u����o����/�v�:��&��6ޮ�l��0FQ:����E�Qx��l����+��K���j��~��(�����Z
nN%:=��/��Z�S\d�w��:n�eOK$����`���F�xSO�yDP=��[Z�&$�RA���3=@ϗ*8�*�W�]��U�U{@���BH�E yT�������O��.p)���*U���J�-��<��'�����3��U%�=q��*�9���h���/Q�������5�´�М�d��w��pc8�N��U!�kBq- X���4�?*=
��P6P;�=?����c��%�/���Fۍ�UR�J��z�+��o����Ŀ\��ȴ;pk0R�	������坐�[���Z?�==�E������zq�c� ����<�Ep'v7�֏�}��8FA����C�>鹗8bU�y	<���xh)�H�V'�Ix���OC�ğQ{��AM��_�= �`� nzt�WD�Ý�঱'��);�0�4����V.�t��n(���{���֛�b2��e�9r���R�&���|u��S��o?���$(T^?�慨�]l���^��
���)��^#��W��?T�b�^����!IU�yp ��p� ��U3�W�ǂR�P{� +�K�ET�Lc�;ʘ3�ph�J���? ϩ�U%�Y�=����]�*e���7Z;�R	j��@�qr����wԄ���h`>��m�?���Z��s$��PP� �@ޫS��E[qT�6C�\��x/���W��
����U����y�`��|T=�09�ڀe�5!�8#q��P�򗏽�|w�I��,���e���2� �Ġ`B��Q�~���U���<
}-b�X�V�Uzg�Xs��/G�����j^]��G�USiz��)R�@e�\� �A*TχvE6&1�?~�S��;��)�-�h�e<0
�P���>T�����)��C	���ʀ�x�>��`��G�l�����@��/�>��;���(��b�SG��W�}1ΟO���۸N��c�B�bw�R�$�'r�L5 o�N�՞o���Iˁ;���$��|�vDvȸK_��o.�r(���y_��zN�;Us)����pw(���Xp����/M]�z�����G�5_��6�v��1���WZֵ�̪��n�@'���c.��wn�l��;	��)�:�-�>��J�H� ܔ����a�� �ek3�k7��v��,!��j��WͰD^?.�)������Z������瀦��?U���+	��r��_J��&�����Q.��Y��*��w�xx)�9�y�\�����de�1P����)�6|�ͧ�y��
�  ��V<�:}>��mGFH�AD��� ��
�CN�� �7�
�x�a0�dE�}S�+c�J4
�ziQ�� ��11ѱ���c�!	�7��QNUə�	����+���U��/����z�Y�Z�6��8�`Wi�(SiZz@i� � |�����S+&h�l4^\�{Mx�ZH�SY<"���S��*�xЈ���F���������F��)ʙ�_�7�	o��&�QZ4\�${)��6[�40�M�Ă�Q�8�}bq"J�1��W��� �m5J:Q'��N( �9�B�	�Ξ����!�(���ᵫ���g����`���W�����(���[J+�!ֈF�z6LE��˙Ɔދ�8�/k0fg�_�|�SRK�i�Q�an!$[��=I6��0Es�駭���4�&I*za� �Ң����n����xf*����S|��AIQ�BV��1爥�
�֐����t��H>)S �n��&1���S����^��c(P��On
OI���W��~y��	PF9w�I�|6;��z����#�$@C ���#b{�