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
       A}6�.;6k�উD_��zM��[�|���k;Ð�W�+i�6Ѭ�F�����X���(`P_��~uR�[I��Ο�O�;|#�nk}M���'o�W�9`T����}��ʎk�i� �����T3�,	}��TxFs����'����U�@/0u�%2��aB��(�jhF%���::���%��jQp��x|\��%A�N���A S�������B:UV�����H��H��"A�L�qx����}� ��u�~����<�)�����-U�x߾�}����/'�|��`��m>�k��%�1�_��~tT�\�8H]�uV�^��"���CP���鍷��G��|�}��tJ����3�UU0u��a�g��̃�*�����#5���0C[�vKb��W;�-�}�B@B�b�4>�*�n���%`��&)�*5�JH%�+ �p}A�%*��|L�������o�=C)�C�zr�9��J2��|��y\����o,�Fp��7(v��S�Nx�c��|y�AŰ�M�p�=!;(���C�x;��9��#dB_�I.��<2F�����I�Ղ��d��ܝm0:�����r�x@5��\Q������f19ٮ�-���t�����7ZB�0���`.���JԃxX�`ʄ��[�[�����֗Y�*j�'�ߪ�p4Woˋ�ԉ[�
Y9�4W�U��X�+t�)��p��Ȁł��!�˿��N�7���x|��bYQ�N��2D�5h��9k��������~�{���cm�4��QDڇg��^ Մ?�aX�Bo�<,R��
���
��~�f����H�,}�fM����r�n�`_	���W�N�9�P�Uq�ۑU��9�̠
PqBVB/���J��+>F�SJ��M�n����OKz�
h�����w��#]�b��\qO�$
vU���G���v�b*P"w�yڢV�	�Eɂ��Z�U^��#6��wެ��j�?�����<�^"O��y>%���?��=�ɹ�?�'��t�������M���\?J�ō�����^)�<�s
t ����U����l/~#(�T� ���?A�AW"�x�y�Z�@=P�$�c�����tGp��SĖ�#1:NDg՗Q�΁��� ߄"��D��\U�7����P����v��.`u��*�`iB��C��O���w�oPH
?48!(5�+��sgbzNx�@?�U�:��?������KB�U�r�����!���0c���o���G��T��h �e%�H4P��Bc�\Ԗ���`^5
}����=.l��@Ľ���KT^�����Z
���,K �$JU>^�VY��|0�)�_�ڣ��@��A�5c�X�Z�j�1�Z,�% x�$���`w����p{TM��vQ�i.���`C���<����į��P^����0}��⍕)�?V>�W�+k-���rRדAt_�XW*�1����SV?��`���ሂc��y��cFDr*��qbiaˬV���/LZ����F�$��d[���p�w��]�`خ�FgT�<)�
�c};>?�GX��G��\{$�%#w6���ϤHuT�|�M�	F�޾�=Td价��?&�l�]&���u�H�~?��|G��2���U�������=ӂ=/���f��2�ߟ�0�e!�������Bܦu_}T�g���������^%]��
h����/V<����p��Ċ����iŢF⼢/|F?��Kd�6	oS�/��#���"���#��!�C4��{���7� '����'x��  ��U\�S������h�t�c|;����_��'����[FZֵw�F���:��$�?6f�p�D/���D;Ѻ�)u���j˧��@P/��;���`��$��Y ?�o	#oz-tP9:$L�Y��:�_GK5kMdЙ�LѺ|�b�M4�o�qqu�:%��W�v���dE�� �@~�]����P��@�讐�L�4�j�Mk^�`�!>�%����yL9���� �oϢ�-�ѽ!D���:t�K�	^�d���0zl2��yс�Q�H"���jp$%E��r:?�
i�t�tP8Q�j��IV�mi�u�Ҏ���轪�Q^�,	(�4�GGKh� '�)FaC�9h�:4�&6�_�kuU�8:ud��A0��������F�@�.�d�~�w袣��:��D�"f�+�2���a̧�C���u�j�i$=|x�P0o�ᚁ�0:���
Z�J f Z��E$�
�#Z&�ѤmUP��mUH�k>��*��A��01�
�Ҕ��S�#��+Eem�������Ǫ��A�N������#~�aM%[��JT��(*���C��QI��8"/�!�i��$$�H�z7��k*���:�0Fe�K�AI<��ee�Ec*��{T���I���ߢӆ2G"O�I iP;�촵m��MY�*@��d�K�D�P�f�eu�~��tV҉QD���C3��Eӣ�Fdp`4��@�ZF[�� S�ȳ��M��
�	"R��q�J��<�!��w]�ii:芓��EE.��Ag���-H�3�� n��/tz*��D4�z�i�}%x"3��oU-M<pex�D�K���{#r���a�::4`�.�E[(x"�@�e���u�L	8JԜ;)��1�ᑂ�IDS�:(,�QU�Q2I�H�d�����)֥vN��t��D ���FA�F��(�|�Ѱ�A]�$3���X��T��7!7�_?��Қ@���j��������Ȇ5�O[�HX�zQ��F	���H>�K��(nf,��<(5^2��p�ٿ�+EU�@­��/DL	FP���� hɲh�u�M�]V=Ɏ?PD�$<��������VWJ��2$�E���*?��6,�r�M������T֢q;ڐ�ti����j����pX�k�*Ei�)ӧ� |$Y�����I�,����P���k��AO*⡤c�D�h��2�!��EA����(�^�7Z9!��
f�8����GN�������v5�!����0�����H$���/��G�N��X���_�����U[�a����+����PVZ= �jU8���2�o���s������CKć�趺WHX$2�D���F�("�t���u�E4�UTJ����":<�>��s��IP/x�1�(b]��Jk��}DJ�*	��<
�[��n/{���U@�6 j�'�I�5>��F@�?W�jF	��֨�0�m�FG$4�����x/H;�:�h}�ҺG����I5^�vE^��K"�����]��(-I?�=R��� ��M�̋���VV}Ģ�#GP0Z��� jg�H�޺QU���kT�3�n��i��O�1�G~�Տ]�>�7A��N���E���iy��8��0��y-,��eG���l")'A0�:	�K�/N
��)a(�1����84{��J�bN�3Z n 01wb�  ���d�N�,�T��*a��M�KFl��A=�ih���<8΄z"��'�����3�:2�qV���̩�?��S�$l���E�y�  �� Nё�Nڰ0�
���~(�LGi�M�S�2�P�ԜF�P��[~c<#ˡ�\�$SXX�AH���63�+l����;`%7���,�`i�Z����CH���P�L}^����T�˾٘x��L���"QlEB�+�.&,�^b�|�P1t�fE3>Z���!�#�����D1���a1gF/�;�"� 
NP u�a�Ҁ	@�F:S��0�t����Ҙ+�Ȝ"L)�X ���$�`'��V��g��$��G�L�O2��X�֬�%,��0C�� �qz,��Z-�
301wb�  ���d�?OS�fNʗa�:�IFl%�*�և/����i�Jv���ʱa���� }.�N���u"L�'���z�cd� �¸�h�дF���sR��!p`jL �
�P�5J���n\ f��a䴩;5�A�HT*�+^'�U�A����UW���/�9>�������c���qH����3��2\�w�IYdI� xAu<m�Q��,"�i7�v�2�ps�L�-�i��@�)#}�3㕺n�QN�wyP���2���\u��F|�Rq�vڊ؄9�omt>I�j���G!����,��qǈ� @��YC�kIQ�$F;@/��(&��@r�`��H�,�G2��Y��Qb�X�2V�����Ø�����fpL𼒞�(O�@�����Ⱦ�KQ�R�D������x&}	�ś�6u�$�^�w�������j4(QwE%�I"��r�F�Z�݉'y�.�Sc�\xPNBHFl�M�w�d��00dc	    �� ,�_�ӯ���!��iZ����j����3*um�oW����z�B~�~�^�xE[TtR����k�Tj7{�"6�N��@%�7�$Tb��:o�n��AQ-#$R�j���x�jo�Eo��0��E�����J����^�0GN��];]��u�+km6�$nCW��M�4D">�O���IL;��QpTox�.󧓦_��m:i7OH]A,��J�׺(���`}0Ӌ��`h;#�e0����t�_����M��@�z�&�:t����h饦��U�D{�&��ؠ�'��+ύ�������u&_Lӥ�@�P*�鴎�5�ӯ�&�Z�Fֺd��o�	<����b��֔��J> Y�: ^2a_H!����`Y�05c�NP�"j::JfT�,�����p��mж��#�14P�aKҾ�,��(ɿG$a��HT@����9rK�rM���ʊ8P#�ž	�BqAK|XQh��b�R7�
_	�bs�����g|x�7�� �R�GO7T
��`�
�I6C4ސ�P
+�c�.a;�l���R	�'eJkfB��H�xhx㨤D3+ƅ�������G|h`t���ZN�|@�����t`a3��#+�A\8���x<I�<���-Y�zV&�x����ppU+t�6��D4W���V4��j�H�fI��G�	�BA�+�	9Qq�Kun���7	����Hz�ޝ�x��uW��KGPQmR�=-�B];r�k�$8I(}�ҙ�]�.��Քڥ��&x���|,Ʃ�;��Q��i
t��mw�j�z::��ZD�&�D'x�y^��t��dz�F&�'�&!��6��Nr��(�̎�U*���Ba�{�G�S<�SM�n P%��P7S
Ug��5g�7קN(7�
z(􂤝3J��Tt�\p�I�ed�H��D�0���U�R�c�!�F�Y�(,�pt�⁶ph[T�>�&�,�s�ӧP;^�t��B����L�aP�]N(�f�e�д�v8|V���S#x2�0�����hm��P�Ke`�I�7��=��� �m��j�a"�$$
����w�1V�0)�*�OHq@jw�f��$⠅3;�V�o!��?w��I� YzyF9:U:�BʨC����|4$�������V��pU��R�7�4.8Z�Fv�"@�3��B+W,Dۘib���E�b�jp纋��f���4�R$-O�P=�O���a��y�=���4�zt�����#�+C����b1'���I��ld�"ॶ���>�	����uv"U��!Bb�1���h1�Lt�޲c�F��K�`��|an	�F�][6mpd>�^�8L�s�/J��-�H1'��%��@�	��h"F}&C em�Pj6=�u-0.�.W��i��y����O$�@���^s+&*����!�K�C_LE[�HH��*�H/HEJXâ'���D�.���Xpญ���<*/��L��d�l=.��v�恀�E�K�%%�F�F�v��K���@&]��8�Le0����a���c\� <�mlX���H��ԫD�K���gŪ�w̶��AΟ�՘���]Q"�S�!��v ��N��M�B"�L4�J��\7��n�T;*��ͧ�x\�-Y�&${}
8���`?>x������8�Hp��p���h|� LS�ht^�>Bs���HT�ڳ�Pa�x(2�0�VqB�rN�c�u��B���DpTwJ��6��'�ԋ��Ƀ��\,��0��i�FJs�d8�bj�
�Vz��;���)�z"2�ke]5�@��F����5�!����fP�	���1�y�)�E�̡���waY���͈�J
���'� P0g!$����I�P���t�Px�p�}60 �w �AWk�B�(���V�H`"='����D1�u��ry�k���e�q}�Fc�����5GL1�(���`���uF[(�DXd���j�<&K��]�f�i/}}�Čc����U2h�U_]¡zs�6,?�,h��.��p� ̠y7�|Z~'����vM��K��ۭ��0��D��ABJI����D��y#p$)��b"�â��ԓ�rn�q�b8T%#���*>-���M� PgocGC��K��[�	�~��������5�ݽI]I��Q��j�k��z�c2�O�'i%�����fa0�v�Bw�:Y)�p�+��Ӣ̪&����4�N	d#�F�3�Z4c�g�>��m���Vr��|V2����O���01wbP  ���d1�RӻI4:�z�0���#@m0p�����3Z�h�,�w&��a�L<H�5$ }��ٶ̃�Mˀ��X�(��uэq�H%-�g��-��"'"t�ϝ���B�K�LIv"��tR��:[} >��0
0������1���(���3����t�< �8<��%	�ϏNXd�Mi���8��FG,�"�
$Q�_���̉����-E���y��}!uj�l�Dn!��|������߀Q�h��D/�V��-��1�R�}l�ȆK�(ca"���W���,�4�6����
 ��Q5"�J����C��HE��P��01wb�  ���d�)N�;�I�
�1C���K@l�@�l��

ɖ�X�%Kk���{�-�DbidZ����5�o��QdFͬ�@�:�Hfu�����[U���w�W+�: ��� 30Kv� ���h蜦#�P߄���@�t����U��(��G���E�G��h����~qɉ�r� i+���8�"!@�MɤH�y�4ޢ��-`=k�ֵ�j���6Ɉ���߁�>ľ���EN���Y��J�=��k`2�j���wMcx�M���4F]L��}�B{�%�F_Q( �L����`&�ۖo�Q�/�!�&ex�����	��3����Yܗg�%3
~��3�
2�����$�� ,`5,ȁ�% Ň��00dc     �T�� 01wb�  ���d��P�xA�=fz�0�f�]CL�1
�e)��!�C��e�80.4јI:E������'V�	pl��f'�=z5
�T]�N!v�Ǖ������Q{`�\z���|R��O�����8�n%��?�V���G�l�l�R�,��`%�
�؄�f�@|�r��q�=���+y�C�Ѝ2-�����^B��P}@��1,2I�k�+�߫@h'
D�u��pRVƄQv���|&6��O��t9i.�x�͘�G4�1D0�'����������us\�����ON���^ڵAf�|�	1�:��-2��>$�c4b��v�Fb��j�)�'4(99y�i}�5Ri�0��N�8X�Q���C�C����Y����;��$���>� \X�-� ��2��L�\i2�"�
ܞ����_�� v3��aU�1��yr�T:��ޒ��c���������8�		]00dc?!    �V�l�0=�}�ݙ�糽��ks��ϵ���cl�e!W���Ѳ�	X���o!U]�fp�K��%:����}���϶DF�Oh�i��+<Gm=�����|z3��_��� q�d3xb_�۠a������o{����<�x*q�S��}��������l@A��C	G&<�7c�:�4�O�y<��KrA��=�J'[[}6��#+:c��<���z~�q>�l��=��n��8�9��BcL�3�,yN+}>��o�������`y�Z%t��	����C��~���¤Z'��I�V��5�z>�}��{��s[�}���-��i��*��^ϡt�סo�01*v��22�B�
�bM��X����x���Nģ�ފ.ō��"ܔ��̧ޛ5k�ہi�����)���Xf���s�l�P��x��^�ُ4<�eS�-dN=�8jDp`5�Fw��b�'��|��G%W� ��x���A�wf�;�l/�u.���ox��>{��4�� ��ɔw=��V*K����/fm��*:��u�ԕ�]zpM�#:w����,����5�ܷ���n�ٛ�U|Abk����.�P�q1�I̞�N@`//l~ϛo��ENagݯ��`\�ֳ��z0L8/dX�'	�qs����>���yOr�>�ks�Z?Z8��)#�[\}<���8�u����4W/N�u�ʞ����O�ɿ�B���0-���+�_%�,s��f�ݯ��<Dފ�[�)I"m��p��ͨ��u��G���"ַ�KQU΁�_x*��	-�-Czt�����I3:���'m��K� ���.��(��S�����H+3��ZcU�0���k[�.��@YY8f2�q��}�g�,Tx+�nT~��p��dWyǽvj���q���h&���%��m�X��*a�$�	�}�W��m�z��i�k��C~2�N:��'Ԥ&�+z��*#'����~7��/G��٫S�t�!�3`�>��!�?r�$�N�;���_r쫇�nZpE��z(!��l�ā�m�K�{��IT��k��%#�=��5	�`7.�ʡ�A�;�ɌSc(�p�4�������&������8=��I�}-�[g��8l��&6����+�H�z��/X:a�O�sȞ����HoW_	��%�Սδk{�z�,���������x�II�8��d��lr�T��Չ�? �"�hoH�������}�m�絁Ur�����xV��F��ϑ.^�����F����oQ�</s�q!���_^�v��`�ό����]+|�+)<��kЂӭb2�M6
��pȰP�}ꍝ�4���$V��lEzn��gp���O��U,\�L:�Í{'�b��SKJo�)K��j�;�F��� ��������$#�[�6�YΔ<>5�C\��	��7�����FW
�y�g���(4y��p(3�_Z�m�������Q�L�T�~Gi"o��0kӏQ���BC�rҎ����4b9�􎤬;�����"kOFID>�p�&�O���4�M���鍤)�T��ֈ��n��am>=�ҷ�c�ªػ��L7��R'��غ�r��^m�z���7�����0T6�HZ���	�3�np#��*G)4�z9���=���M'��2{4ڰ�/^��jLvJB�i8��;)�޳M!�ƌ=t���ng�����OQ��kM�H��+�+�Ԏ�;�9ÿ����ӥ&��
�te��&��̓d�)��)0���ݷd�ń�);ZAV���X�i*�����$8ҝ0�'%0��y�x#V���s[�Jd���8�l�W�PI�
�c]�w��0By��
�	n���!�ӇP��3�i�u��Irzp��G3&�]LdR��� ~t��NltR��κUI��Ӯ�MG)M���t�m��c/�o ^�{��r� @CXt�/�*oE��ǚ��iJ�n��Imt���m�C[ �F��Y�{�L'R|�f�N˦dT����`�Β~����K[=V�B�];O'�;ץRz��yh�e^��~V��.���/"�3�h�/{��Ө�����p�	C0�7��SH��8q]�t��76L:���b��҆RJH�!>s�zxF	��1�yA��/��'`�i� 	^�[d!�,�c��?,�y�M:����w>��>n�f�<e�rFz�I�f����$��U�0����͜##�e/�_OhU��=����d�!2���+��2�t�g4�e�~����r�<LC��Xi�;���ҿL��n?��ch��wZ�I�=��لU	`�z7Wxf#�oxf�F|A�{�`��ѓ_���.UA�@ F0�uLq��v9;�y��>�8C���5<F��@%�#ޥ���߸�y���M�e�iԢxNq���f���S$���v���'���%q��p� )'�ҥ�ag�>"��}ɲP�������qq���Aku���
nr�>C�d���ָ����f��iwf2ޘ�RO��?�����d�1�SXXpF?�)m�=A��[���	���7���`�e;�o��V>�ջ�A���/A #�G����R������3�uL�23��ۣ�9�gM��V{ޭ���*k��܍��e�hlH@8��1���aȮ�s��m(�r`P�/ʔ��o�Ql����q��:m���N�}V/����Uw9	.s�$vJ���#a�~�R�p�EwRU�zzv�>_GZf�z:6}���l�t�ް}[�|�|xS�b8`I.5�h��~��B�b�m#,1����p6JÁ��[H��q�y��Lď	)5V�"M+�l*�@ؔB����]<#:�DpF:�2Q���d���$��7�KM��)���Xd\x
��>M��㏅:P�?�v��0o�ag����~�G3��9�de��Ã"g��͢����N麭r$���5�c>�/�ZG�O�u�c�_nޱ�7��3�G��#9O�N0�E�%���&��.���^�fQ�J&�vl>i�k��`U�j�cO)�Au1<2� �����RRLU@�JG�H�d��-'�uu��$W2q�Z�ץ�>~�$̏�0�D�6��kgA�?�\2W���@ܣ����k��7�p;TT{�y:=��<�jq���rԼS��C��nB*�W�g΢G���=\��Vx��ۇܫf:+�׍,��=|!�z��/�U��Wk�٢����%Lqј��ޏ{޶�n#�殳܄�+أأ�"i�
M�'6#��������l2� ��#���^'�1j��SqP���h�꼣�*NL��; ����#\:F�DV��ϒ%�4z"�aEZ�FL4g�̌t�)ѿ��ک��va��g�����������1+��U~N���i���zU�׼��V�%�̏�ײ޻�0S�J�#� �o�8C���[�=Fw����s�N�ʟ��|�^��
���H}�M8.����\����<"��:zx���)Ɋ����W�m�9��͒�N�Z5�x�-ns�Έ��J�0��xg'��9���.z�/>� �c�ҡR��5��-z4���_� �HK:��y���*��O"�1#�
G ��ݺ��o�>�r!9���X��s��4~nˁ���Z�D`�J�ZӃ
}�*�罰Rw>�#O�ۂ�q��pd���)j��H��H��u��%�g�l�8��{��� _"�X��.�]�˗���x!��$�3^�i����r{R��X�Ofu|�0��#\
i�?��0�_X%
t�LWDnO�����_�v(� X����Ǝ���]� �0�2�,�,Rе+�|i	�Jh)��X�5��+	�ȃr����X�_�7F}�X#�S�z�X�n������KQ�K���e��h�U�s���8�� /|�!�c���D�+��F"*��W��[8F)����e}+l:��t�h��M^�~6�y�7E�t'b��f!Ӭ=����4��Z���q#+�[��&D��Ь��_k]Қ8�e�eϬ���[�� S�D���W��L�	{U�![�Q���-���+Q+`�(r:r�1`����e.���R&�n>F�Xܱ������צ��	�.�7�ɻ�R-��n�FDtDUf�����?}�k��V�⽘�����c�uNX�)'���gk颿y1�_5T�;UsS2F�q: Jh|��Rê�8�}m��p<w��L�å�Ǉʼ?�yz��f�FD���a�e�+ķd3�߂�}z&���(�@�)�=��1�~�d�J��NO���_�Ѳ��
դ	;�Z1 �<�Չ?�{j'o垑��l����������_̩E���clSsy�s:2#O��81*e�
U��;���kb{ƷyQi�"K2�������n�;}�� gI��'���[f��_V+�����0��=@�Z�<,�	���t�)�>N���5���/�ى�R6��O�Y���������{}V�C9�[S=���{��Q;z�ƓOɯ�禍2��2�`NE��ƚ�t��.��XJ�&|>#�~�k��	��ivI~#f���
�F�'SP��,�gʟ�����.��]��u��O ��{�.����/��zUE}y���S��ꮙ�e8�	��&��.<4�J�;A�`r����*����ij��UX:}���:d��ӓ���$�;�?���)��_�L��,##Me�}>:U�R��okZ���-�qB�+d^#L��}ZN'�&/����@&AG��,s�:����UW��o�=G�<)S�>�
����ڽ�5�X��VnjC��*��q�����=�5�Y|�To3���X1X^�Sc����	�Y���a����xw	ey����ҙ�ܢ�/��=��n1��0���~�������ǽ�R@�j���ܔ[�[8�YW�ueG������;:m����w�H��)��X��-W|a�hz��h�w̢�>���q(HW�|fja�:����Ou5zm�T�HB�=Dm��ɑ5���\��*ڋ^>��ľB�`)�L;��L��k�.�f�p��8H=�N��`��% �	jr2�V�
�@�����(.��\8_[<#
?�R����P�_��L=�L����g܍�0d	��:��ޠn������F.��� it�<>,��H�4� a�S<H1-[S��C(���f�@�_�����~ꟴb�Io=��z"��նFuF'�q�	2q��DB:S��b ;�Q(�a��?�r�qv�	�&�����8y}5�<Ys�{�=����j���uE��ʔ��%o�c���x�+.���r�/��?Ęb�����y��TZ����}�4�en{�'1�]�9�o%�*����Bq��E���@^�y{Q���}T�2.'zz��82��o��8�F�H����T�d�R)��4����0�{#B�����0�2w9eG*�y�)\�/��PMe<y*�w���g��rV�u��y�E���p����J҇w
	�����*�<�;���|�|�o1!����5lu�H�N�NJ�P~�%+T>��xs_Tϫx�|^:����upW��˳�~P�:���t�SϏ��  4���A��?U�je^��#�>��4� aOV���.+�t%+��^���bH�a�0#���{�Xn|�i�W�͂��9 �0��0���N��q�&V����3~#�+'�����@
pt�F�c��]d�!�V������	�v�f�K��nkW`��Znp�}3�N~�q	Ӿ�\��]�6vϋ��wѿ1['Wwސ&�ܱB��e�៱��=� f���8�ѷhUb�`���ܶu%yy����j.+6�3ٶ�L��}9e��A�}DuR�PQ\(���#@Cnm?};����oE�N��{�]j�c��(���|��Zԇy���b3��{���+H�F�o�#�Q�戥�/G|i��g�m~^+���!UǙAE��H���@=ǾTY�"6V����cs�*d�4ы���i������6�)��R|S���v�[�k�3���*=��I���%�Yn��a���˕�T�V��aV�W�����|����<{��	���S[+?���-�O�S�̆((sn<�2�,E�w��Aj�Zڑ�=��{�/������5\]��^���ǂ�4U�	p	�}�w�#<�9���ۋ�ᙶ��:�������Ӫ�=ш�n�->%�]���>�nu3��Fk��$�����!��{<���N��&�>���K/��V��y=�t̀p|t��x���f��o�_�q�R<�Tn`@~�o����a՞W�Ơ��G�9��"S�����X$���W�>@f�+�>A�O[<���v� S���,���k/�w{���D���ʇ�����Ｃ��G�8v�y��/�s���͗X��Qq}.��BEr�
���;6I�fD�
)����p\��K.ߗ��T��+U�$���߳OWFv��E E����&��=�]U�ūcA(~�x�!	{(�iv��"a�'��Դ�:&iwՁ|;��J��,�ԧ�;�]�H.`�K�#�&�F��{Fi3������긂�L�!�x����sЂ��1� ��O��$����9�O���\�FOK�-y�=V�m�i�ߩ�Jdn�Pt�Հ�ؔh�_V��ѥ*�{r��8Voe[D��}�H�@a��_`+�:��4$ =�h��m�	
����l�;�����M���1���{>  ��U���G���������M��u]��!�UH�7�������� �<�O�.Zu'���:���$t��s��:�H������J��6��;k���N������z�G������vd�֠g��-XB�@�z|���$Y\���z=�����M��_��@o�ș�sk�@"-�O������9��D �����z��
�Ov����>�ܿ �G ��Ԩ�+��͂N�?�� x����t����d�p��	����3���H  �ɸJ�p%��
��H^���6�PGF	���
��RE}�:�oEk�1�EZ�WDѲ�$v�|����!%��!�(��D���ڮ�M��N���G� 87���G�C%�#��BW���(g���V"zp����	UW�D���=xBd�7���p0=��ܐ,c�vP6�� ��D�~�V���I*3dE�`���p-a�����:eN���θ�~D�4��(#XP/I�x�	�O�4n��`+�	�Cf�#���	*u��e���e0��ٹ�t��&���h����tADH�|���A0Uۆ��rQ^HϢ�aMS<�S���Xp����t�V�4N$ �y��V��v��A(.�6��G�|���Q8����py�,d�P���:8�� `�@צ8�z8��i�<z��EV�U��g��%G�9�q#���&��E2�N��3�����z�����G�W8�7F�^�����D"פ/ȝa���+�a�J(�I��N`Ί�v�ߍW�$A5~���`,�WzR�Eᚌ03�ƀ��C�K:�l02$�Q�A�N�ŁGeVv�8v~������H��1���#$t(��t���},k���3t]ެ0z�s�~�`|�=�8|j��d!�`ǆ�a���#D>P��7Q���s��D��#5z��@p���B�3ӧā��ڥ+B��7	�R�����A0��q���*�.Fss�a϶G��:<պ,}�C�����㔴��3���]�a�e��08H=�Ci� ����Ox��/�q8\T��	���E�a;x���d��]BU�+.P�`a�����it�I�C�À�V�&�O��1�v�&�G7���[ �e6���"u��6���ʟE�����v���I۰�d���
>�Fj?��`1�УH<5�`����:�U�Q�7mS�5��(ɆT�X��Y��ϚFF_��;���j�w� \!^�XM_ţ�Y�>��/�<|����?y��)h�Ξ�� �(�p��p3���x(I=4w;�K�B�l���pA;'<<>�э<,>�NP>+!��
�X5�x��3�h�4.�f"���g�q91���E3
����:TM�D��s��c����8�*�������1�U2�!����g��\l�������.�$��OC⃥,0$;иH:^>?��|�Q��v�B	�K��'�(����z�"��I��竪Q�Y4�W�s���+�����hMzk�.�i:��`"��`c���gd��tAj/��	M�	
H�@��A<6>�cI��L� @|<L�qߐ
�,4V��3�~S���1(��1�,��>Y�1�P�|5�����X'��Zth:_��`p}5��S����tH
�0TJ����<�8<�/�(b&O�����@,�O� 01wbP  ���D)���EVQ�S�^�g`�v�L�Fl�%�_�*����@�Hh�R�N[hH�� �B�������7C���$��^��3:�jl���k�r&:ȹ��ۙˆ����vUī�]EC�_������\�{K:6����v(~����Jl�v$�'�L��V]�� 6i#i���Dg7������׸J��W��;��꽑���d!�^p���!��$��ic)sR8U�b���� `�܊&�+G��[����	Ϯ�_�Ǵ���9��������V�:��{�ܠUdoȨ��#*���͆$H�}������.lP�T��������ē���01wb�  ���d
YP�9�tH���<�|��;Jg�s�bh�!ӱ�r��M���ޒB?�_J�]�{[?Բ��3�T�>�Ľv���NMJ��L�*�Dg�ɘl�y�뾟NqL��N'C��y���c�[� L�͐����������p�F���ЮC_V��̾z��Ak}��-
ͼ�7	I���k�r�g�f��NY   VH�?B0��Y�q��˓��ɂ��1 )�su�t�nԔ	�������o�^۽�s�[���!�$L�x������>W�
!:���P0�F%���x�) bc�AK!R ��$���j����_ر��f���$�X��?��,(2�rK}���ǰ�^���J�<D�WG"&:����1��Q�*�n���z#U{S��ٛ�Q��G�k��>�W3?p�)I�����X�a�`�Q�2���]����?����o�32�������}ר���?:~�JH�00dc�    �� ���z}���ON�� 9��&�ސ�ߣ��G���-(�A�x}A��IW�B� r�)��?���N�! *3�w�Me�����րH�U>�e���r��_���(����(����[k���G$g��
��q�	PC�E��h�ǆ��0 ���_N����M}J��`�#��|2<*8�'b�<|P=O��Ai��`o'�t��`���	�.tY���|����Ck���DY'�� WK�� �ҩ�<��O���=.P�RIODz<g��$xO� k�Bj���t���s>����L�����g�CRxسuI��} Z������C�&��҃3��H��N�T\$/�l@@GM�:y�#��M��z��� �2t0�0u�!�5 %	��M�At�թ��On�B#նܑX�"�����ѱO.�S���׿�` X�aCϩ�� G�Gc�f���D��^h�]
�ç:z�5�G�T�I����mD�@5=��4�4��i 0g�T���C�"VoV0�D�>�(��>`�<(��}5�-J�=0�mǓI�]@씦c���TG	��4�$<Du.�����Q��j�����	 
����Oơ��!�ҠnFaQ(�������������U�a0]��`�D��ꉧO*7��<�i��Ꞽ��"�@�� n�y}z
z:�E,?�WMdN�c���6�r1�Ϣ�7�,-<P�J2=%l���f�BC��Au8`)��m��V���HpN3D���~�*@�p07���uϧZq@�o>nß����fpK7�]�궔��B�JN�������ۧ��d�1�P�,H�s�8�EP+:"(f�`�E6�p�D��OH�8�a{�2-�#���O��xh}���,i��t�����DA��l^�@)s�N��G#��4�+p�S���~"�b.j�����pL|5Vld�������:����v�1��>�$>p�0"�D1�ظdI� Z���,i�:z����țt�����	���hA��c����������Y�9te��xhoc�U5�ωm�Cs�αS��"��B�Q�ѷ�H)��(
�$'5p��3M�2{�*3���ѧ߳t$H)O�si�Dψ�.(:��-�C� ��`e���p���q�;�u�Â�?y�'���ɩ�W0||xR�ތ��>�V!���+��GC"���!�X0P%#�"��pZ�ţ�9�6m	���I�S�obaOI�J5�x/���T�q��
�1���6$�F���?0g�������A����� �	��O�>x�gthp������zX�E��@<��L;�3F2}���ri�`���]����`X}��k���M�ր��F��H�L�����|g��*�W���:�����68V	E�'�;��c���d���v���W��|[��.֫2�P�� '�m[��>�t3OPξ8���U9 pӥ��l��c�,G{�$PQ*�p�j���ʜ�d{[x��
s��N��
�G��h��z���8��Y��F{<�Ҟ�izmQ�[4P艏<8��m��p"��㤱b|�������C� c$�u�~�<iP����HΤa��M�b��}�<>�},v6H���b��S��z#��S4,��,����ͱ/Ŋ{�&���Ĭ�x�[�%a�cF�����n���-fXdG��|J&eZ;�7�����t�-�.4�*����L9��A�qa�r�?�N���-]�pt�v��i_01wbP  ���d.{LV��3~R�:�<Ê��=aG�e95gɖ�Nٴ�h��.zG�V���;����\���C������H��b���_&��sӱ9��f5�����<Mp���!�b�׳d�U���R:��Sr9�_�����)P�;���BlMd��+K_?���lY�H����d�C��&�jc�v��Gi�Ai�Jo��3�[�Ǻ4T��t�Ϸ���K�(�Ŏ�V�;����1h7w� <35M:x5P �� �;�B$��)�i��,�9c'}qC�� h���̞��.�o`�bL@&8.�ϱV�Oa�JV��jm@����y���0
,�U�����01wb�  ���d ��N���+|N�zSa(X�uM_,k�<h�����>e��	��e�x�iF��-�ԟ��=פ�H 얽6�ÎB�j;%��#�og�V"��!��Tv:	�Dh��)@H����͠��Yap�6:"�
{��G-4�#�>��z�%U�5�:;,Oh�2�4󨗽!�����VKQT� ����(����q鸕�*xXr����i�Ky�/i��H����>kʊ��G�Z)�"��������f�	���T�"#+C��)�6Y\��"��#0 l��Y���Uܷ�9tsn]�IdhHN�F� 0�&�+��j2�M�� E�j�Qߎu�1f���N���HC�@�ےS��Ĳz\P"!�Z00dc     �V�i 01wb�  ���d B�_XQ�VTG:Wa�<�}[Fm!i��i�~�*�q��]R��%�$��8��u�J��F%������ë°��L߉�V�zI�#r������r��N��2�x�"� ��K^�$J��`l�#&��� �l���:�I�*^�t]O-FRo1���,͒����������{��+�E��C�l &ۥRPˢo(X]�%r�Ykt�au[��End�}9����ף�O�1��܎���)�72�t�A���)D���ͬ�����z��˽ʊF���GI��L�
��hQ���P�*�F�|�@$`j@�Aǋa�{4�]ܨ��5��BK�7x����Fi�J���dy�P2
J. '-ܷ�puq~%�Z�(Q400dc�>    �X���PR�}��y�Ŕ��B�����9A���g���s���1�+\� (�>�$1���	�����xE��т�@M>Na=�ɘ�၄I�'!Ч�N�d�#7�1�����}�v��Z��H�%��7p�lfO����^����Jɢ;t�lc��,-�5�J%>�����V�E�0�ýh6�w-����G����uU,��c�*�Q@�>�g��
\!õ����hK{Ŏ
���Vs������4󆂇����A�Ck���-��2r����	�6�9d��``����O���xEFC瞛d�܈�p)��0��&�ޅ9�d�	����N ^o5� S���7�Yc	Ou�9->L�r�c>������c`(+]2t��?�@.�u}e�LK��^?`��̧ir���vf����k��`F��{ކ��h˵ɦ:��SO:J
=ﻀ��+F�o�l�£�\�#���)[�m���RG����7p
k��i��.����X)Y*\��:�����-�����\�h���}V��n��9�R8'9����p������{���mDс�o����GC��<M�ψ:P됨|�h��w�HG�IF�D�i�C��៖�Ӌ�t�T5R�8�N����}���t�沚q#�R� 8S�xi#$��X�����wz�[e �z�gnJ���	7�ws8�P��Ԇz}&�Դ�����C4`d����BTc�
�I��z�Ŭ��b�e��[�g{���&��7Zӟ���o+�����<H��X�( �JR�-���`)ؚ�p�H����:��� �J���]����r_��(A�`�>������83a�CW��!��ZѾ��r��Y�us�#��O�8�U�iD\X�*�5�'`�nf%�����s�M�Jn�x���=.T�2����d$(K�
�,���s�@�BT���z�D��P�r�d�Ӗ]�	2��@Ik�5g��ŠN��pG�X�ұ�LH���QnJ3xS,w9��cȌ��@�(�G��B�	}*�'�(kkt�Q��8�}����
f��ɟ#~�.#�[��`�N�H�X��`�He
�G&�JxBܢ�=�pdݜ��0�a��_#񴔩�2K�$M!���s�/aǽZp��F��١��;����K�hԒ�����v�@3M1g*G~nVf�	�R�+�'���cVa:���8��)Ϳ�N;��2v���.���\�J{��\l{�r$�BXQ��y�"/W�[�����`)ӳ~��٬��AMn�#ʥM��˒^1L��z0"`���m���b���a/38r9.����)��WA�`�L����zn���5�Ӡ�V$�j�53��S������5���0�PK���� x@�_Ǚd�N�0��������9|��?�U=�"��m�O7�c���x}<�:�jD�آHL��m�����f풁v���p��~�P��\�7���d������s�������@X���L�!PT��J#��7_C�CĎ�׭b��26��UI)��'x�Zc��3�Jώ��oPpi��[ǝ����(��$DO���:��QR�o8M�8�8f
�NsB+m6ӒkZ�����0Q��%_չ	������A�'�y��Jz�BoWa��NI���}͒p��bbc����R�3ƈ��(�:w�N�?W��s���!�W�ސ���l<�wZ~��Ɉ�z��biϲ����}@c�(<GJw��uOӝʥ,�&����=c�����:+�������j�i�m�TB�a_��b	�gs5�����3�V{ݠ��\/���|�uE�G��dE֡ۼ�9�����>j�"
<�ٱ��|��k'��<�o7,T��� 1�����	�xzi�������Jۂ��z�N�R����!���o�	ê���W��J��2�~k��N!�������o��`$e=m��'�����D>�1OscD���p֝2y�9���ҷ�zб�4��7D�d����c��Iܘ*	b�&�k[�H�������MѨ�Y��x�j0v0vXh���̢�/:D��Le�Z#I՜a~2x���Q�+�k}HM2�*!�p"���X�%�i���Mgf�b;%}*-�e�e��N@#�6t�5N=-��O��	S�ʟ&oy�n�,&������z_��݆�}�Vu2����lV��^d;&�=S%��3��G�o82�-SOpV�,2t�|FVɻ7M����*�y���W8K�ϒ��R�}#�$z^�܈#s��J�#�������6�Շ�"W�A6/���|dKM�����0XJ.��q)�?d��;��Ć��9��3��i�9��q/���	�-&�L��be��c�'zw��r$�x��h۵�E�S�F�Dh�0�6o=�,:�J����
v���E�:�__�����p�Ԉݟ���	��@"���8]T�)�V�X���ob�5��k��:7�%o�QsZA��
߿����q���O�}x��Y퐵��f6�X ��c~��T�*Sf�4=k����g��-�e/�o�A���T��}��ʍ����<��G�8�W�pe� �r��xcCld�o�OIc'ψkty��o}���%�Wc�tj��kd,�{2�;^�.u�HK%x!�,�m��l�Zr��]0}>s���by�	�o�R���u��L}/D	���-�p�ȉ�mú�hd�i!ǧ��A܁�Pmq���T"߮�ؑ'Ո�'6�a����n���D{(�j��tL������4d��L�d�#�rK�>���y9!��}	�
5�g�n��H#��-�g*���;RP��ѱ�3q��M�cAO⋬'u��.J_��j -C�ۈ�h]�O�>��xytG2��TB����Dt���g�L� )��wf ���(�����V�� ��ď�r�U�ۢ��{��[��.pSF���~#�ߦ����d\�!�8m���C�i�K��А��9�{�[в�o!��i-xu=U��x�W�����lg�9;���T�v~�|�ȶ�XE�{��Y�#Os����-��K���Di���Ɏ!����'�
z���F��a�i[��̴c|�eXDB#�Jѹ�Lt�'�q�,.'5��nS"=��Ԭ���yɦʜ��U�r�Zt�@qa�S���J3�{Ռ�ﭺ��9Ol������9!��x]�*�/*�G~&��tS��,W��͐l�I��n��K�;g�Yz�F�y��7sD!��s�|L9�.%���(5/
� �zn�*}���NPD��0Gj���J���3s�[�3�0@���!�.� �sR}W����Q��؂� c����T�O{	��J&L��H��kO��� �<E�`�[�?�lh0����v�b��ʧø~
b(�;5�T��&�T37\ʾS�<�o�<:�F��������p���	=��RI��bh
\��RSخt�s��M���j3�vʉHgb��C#!��~�{Sʼ_�|_���Y1!�������#)���i�D�D��
u��c'JFI���][B�G����<
[�����+�����0��A���撍"�6�&��:�)�F�*��æ�O��h��1� �TRhx���|���X ?�B̬.r�@��� ��H��bi�5��t�Iɕn�O;HV��ns[�?�5�`1�x����ɒ��R.��li{�+׈��(ȧ{���_њ�C×ي�m�iͫ�e�Z��J�C�NN�ի��.y{Z��4&��Pǧ��~Tw�p)��o,}��}��3C�j���z�\��Ͱ����B�<#b�x�}~��z�p��\��{5~��ə�{������\����/V��O<����
)�5SB_�Bt�e>@�X*��pfo@")�煉��ΦM���f"��4D���3�4#t�~�c�!��
P��	U��k��L"M��$�a�y#�(�%�)��k��-<�#թ��
`�:��]:_G���@�L�Je0<
`�����P���}������0�\\>z$���G�Y[0]���*������M�a:�'ԇ����L�ɞ�]h�OC��	��65Z����:���pF�=l�0�����l�w2����:1:"ƞ����P��BOd�ksH``:6���1���`�H�C\����������ֲ(�=��1@�Y-R��UD�����w�>Ǝ|��R�%N�Xu��2p,[dhH_��8�W��1m��	.ы��͸|D#'��z�*��E�vG�����z��F�ֱ�Zn���3u"s��HvF:sVMtS�Xϳ����.�;]Jc�ߣX	�8�?J~ֲg�P��D{6����GuVȤw�=\U݋�&H+����IM�q��E�m�V�(��U=d�=�6�z��+� ֙z��`�
����nx/�^�dJsj�`lT�����uX\_�,�h7m0��`\=�`����s�m�c^���{��W�V8CAM$XG'��"�F|F�f��C�o��#�s]?�kp��l����>#m ���,r���u�.����GG���G}PB���`�f,�u޽8ٺ�538�%�sl�ׁ��@':G�؄�)�V8�<᳂��>|]!3y\���)M'�I�9k��'x!6o'�����-02�E��9}�
?(��Ee�8pA,g�Ǘ�)CE� ��a�xm0<v��J�<�a��V^{�iէ��l$�k�=v����󔋣R�&Y��\�Y�8��e;�����;���2�k�h��XW�"��;�#�1���Xi=]�����pnv�1x��Gwf1�J@����B�o�ڈ/�������$���~���EP�CӢX�.��ї��8&�{�;f����k����n���6�		.|�]�+��G�}�j�N����O�6p����2:6[��7*�Quk��J�$0LlA���#���Du.��zz�x�+��r�
�Lb߾w�11.����#
U���^?�AYO�QT�����9���6���x��<F�'�:�{�C2���5��Qi����Ӝ�	�3���=��VS:Pc���Xu�RDF��#8���`��8u���g�(��:I�^#����Yޟ�Ƀ���O�E3XM�u�ny��[�=='J@��<��Z=��ù��zk��Ȏwz:�<<s�/��S�U]�\��օ��Yb3'��TDmn��É�"%F:�i/�s7xN��:�w#&��l�>�l��X�*&�/�����/���&���$q ��B5�dm7DM�9T�:ֲu�7��H* ���䲫Q��D���O5!iz����ߏ|�Y�RUj���v���4��N)4�-�%��-�o�!�����ug�{����Oj9D��u��&'��ۂ��k� �QW�5ޗa��O�T)eMHƎ�1#izyE3�������P�F�,$8]�ލI�x(Y�[��x�]�yn����]Լu���.�G��)�w1 �P:�3��.U�бVՏ~�OFΑ���Sn�o��k�F���X5�82��0Sۃ1��?��mA�%g�xP�+RmTG�?O/E֣�)��
���=���q��o|��?�EՃIz������@���&YY���gQ�,;�$n�|64F�Iè�J��"3��z�RCHi�K�(˧�V%�J�hztGsM����k�jI�CӢ=�����_,O(�a�)���@>#���@��M-��~'"��՞���)f�����c��p1�c,Y��_(���fPf5F��W���8#�Vy�}�S�7R=�))ћ��$;m�N"�M$�'\�6�!���E+��p� �ٻ0���=O?�J/��~@-��2����Y�:�� �'��!���bq	�(ܺ�X�U�p��|83�yǝ
��W��PIT�%�+��uV��o���MS?��nN
m!�I �2�c�)W$qtW��m�ɖp�Qug��5�o	B����2�#خf�,�n�\~�t���PE�����+�l��#D�@�%6�^\��>LzI�h�����O�Wc�I���O�l��6�b~sC,�oN�G�L
]��S���!J�6[����a�����l��ꀌ2�"Q,Kn*�gC��i��~?���g����(Za#
����U�uc��H�x���u]߅�>��*�u�s�p��O���UC�g����{�n���q5	�*|yv����=����-� Ǩ1A��S�i��iO�}rPR���"aఙ"{���}VؘYK�EJ �����W�8�w+��[/��6�b
�G���������1c���=������ɁUƔ-�`��"�����;~�I�kts�Y9���O���66�H��B��3��O�X= �^U��p��������ؖ7�bUR�I�`j�fL�A��ʭ��vh��rj�O>
R�nXyGH��
�AE����~��X$���u@�IUY}�c5�gh�)���}�F��hF����{�/��e͔p���}i0Z�Jo��[�)��2��j;�;j �!���l�|�����$9��,u �y�੽�r�Èy�����Ƞ"j��¯:*
uA��b����uʼ=fb=�%��,���ݮ����6�'�x�P�d�X�!=��1��;�"�hh#�Aҕ��*+i�ँx����<�a Q28�VZ�`�D�]`���t������)�I̶?dw�aB�"?�ފ)�#�+�"�����%��HT�J�\#��.�b��^:k��8t���'6m�qW_\;!��spb#�YV�OR����{�y�Ĳ�r�򛏌;��N ���D�e{@�e�1?ߒ)i.�RwүdX���\�����c3TwZ����Ĥ?�?7ɂ4ρ���Yc���O�w�@��w��S�3�(�W&��i������x��_�����I6�Ygq��N)��l����'@Z��q�*����mE� s�V�
5z�����;4?:��������vp,OE��}���x�rƔ?��nsY�V����� �/N���9�bC���`a�g���H�V�������[?�]�^���-˫j��
h�7�#�����>:��J@:�{_��ֺ�Bg��Sw{�`�V�kj3��Yw��&���窥��u�y7�`��"�p�d�Rx��g��=X��5�Ӷ85�'w��t����?8!��籐�&z�AO�� .S�dZ,U��݂2@$B�W_����(#ĸ]/��A
��y��R�Q����#�m&���<�<� �<�g��@����\��mIߣA�N����]�N���8�#�ځT����wB/5�O�F��Nx������R����q.D�NFҪ��d��H]�o�?�ڡ+�!�\�x�Z@Z�D?>..U����=4�U��h�����K����6�H��ռ��M���MI����l�'������0h?��ea�"��O��&����ͷO�G�rO��̯Sx��w���MJ�$yl.�[xɃ�4���*y�)OH�����z;ƒ�/�h?��A�&����h�G��/].������KuU�:��>0���t�)�X����f�x�<no����>�K���B{��)�Z�q+	IG_{.YwY�]����M��S�ћ��r C�3�����������F�q�o�X��+��#�~#��<]�|%���.|x"Q�i��>�ج���u��S����!
g�
�����ؕ��~N6O��h��l�:�ƹ��l̼�M��Wͫol��"o��|�3�������F%��X�4�}X����VU0�,� �]R���NC�c��fw�@rI�����{���.mTQw��b�R�6�K�!��Y�r�f�+�(jt���}�[��r�o��������NHt)�)Q �O���������ģ�^�#4����?��-�f�1�s� ��tU��vL�b�/�V�>?�d�ssrɼ�k�^*U�,�d�7PG�:�_U-}Day���\7,�VXd)�xĚ������\�а�2�F��5�Ҹ=Ch���˄tBpP�1���� W��0�oy���;O����J`�Ja���I ��y8Wz��EH80u�Ǘ����O">x1Ȥ�8�^�����5�1j��]��~/��)5
uT\�g���z(?�D�Nom���PC~��e�%!ӄ@S*������}��"��X���7�tFLIU3�Ξ��b}ܜ���@�� 7l]W��a���?Z�m3[}Do�W��������K+oӷ�v���t!�eQ��_j�m�V>W��@�� �V��{՗��8�?DEY<�_�z��8_ ����=��P�xH��C��Qg��v5�U��"Z�� �Do�D����� S�PI��u;��h�f���.nUM�焱'4{}��H�#V^��`��0%�7h�'X����$���G��sN��AJ�
�&��Tm��~��R8"Z��+�8
i�ئ\�Ow���Uxy�����Gz��XE�ʻ�=x�շ��_��rN���wI�CJ"Z?>=�˛�U��y�A,�m����G���(�
i�� t������o��H�\�#^�>�B-y�I)����AO+ĥpE0'4,���|��ͬ/���z?��*챵?�.���$���⽜p�Z�B>+�Q(���W/#c�'_i������!��\	�&F�5�͓��"h��m�)8z2� ��TL>�8D̉`�]���')V=��a�ZL�%z+���1q_hFR]ˏ>�Bz
�2�]ܣdxK�ת�������ëQ(@�ɀCT�1�b����w5�@���f�*���x��[�<�����DE�Ƹ�6l֎�TQր�?�]�X"��U�2��=b��&����ʟ�)��Yv��"�ҙF@����/�K��Ա�%$@K�+�� �Y`�}D|7E�� �%����7���D�. ����,t���Au�DZW=��	��}�R����{��)����U�=AA�>�}c�Y�
}�{��zk�)9è��JC1;��烷nkl�n<)��뼯@�;w��E
��j�a��'N�Gn���O���a2�0���l��
x 8 :�zӷ�Q�I�5,�0��ܞ���k&5w3��I6ǂ�~�HIS!Ms	�F<�f_�NA���D/4�Df�� ����:��h~�JV���19yp���)��r��҉���{#x��W�f'=G����?�Cd�F�ã�b��n޲�� �x�_ �}�\Q�pCOF�ry�L_�M�����{��ۤ`|�!�Q���Wh�=���� �T��K�� B�~<�>�w��km�wNM��?x:��g�H�����Q
h���w�]m�,C}�ؐ�����^*��Y�r]�;�+i�M�`��f����)���3�	pV�kb/@'��Z
^�3�5���~]�����R�X8��7�z�O�P?T;���H��3���^��b��RkG ��{�ٛ0w�_�<��1��M��*�����أ^�1�	R	���F�r����<��"M���U���o<���ں� {�n�i��܇�Y�������]��cB��c��x)�赟Q����.��x�1pӧ��|���]T���Y�;����*�<���z�7���X�∦r��.���[ú2Yɮ^S.2m0i��Ѧ.�7"Wt%�xd�I@!�I5D���ò�d�����<�*)>D�u�%q��k���biTj�۞��X�M�^z2�rI�9��=�p�\/��=�t#�G���#���G_��к��+�e� �Ο�U��*��*�5J`)�_���Z7j�8%+W"���X��S�x:��6pu�~/�����O%�}uD_��5~���$6	���T���@�U���0ߝ���K^f�	�k��V���ִ�0S˕y(���Iƿ��'��)����P	J/���`*��f���+w��D*�� ��F��Uy�Ӟ��l�\���V���7�r�_��m�,}�&�g�pB�0��|6���@�D�mw��^jp&�7����?(�d2��90��_�W�C���V
�å��#�Uypa�����XE�0ڕq�hǸ0������?��M2�t2�5��`\�固�i}+�{zٮy�Ph���Eq�99S�)�J�'��P&�\� �����l�B�)v�<���F��3t�b�
�����Mp��J�P0�-�TQ�������N36��R�@C��O��\SZV��4OS�`�4C�s��vF&G81c����D� ��l\%�a_H�"��o3�zJ^\����m�bL�p
h���Y��E�ɕu�a%�ۣ�C
��WZ,Xл����uꞏX]�~����;}X�>�j�ْn)1�TT}<Ӏ�ƾ�UVh�ʘ�$��ǈ���I9����I�J���@7�z+�+ �~�����\PR
�?ߢV�"���L#�)��CJS�b]P3�Y�a��B���������D���GkFJ}XB�á�쾀}�aX�%Q�#jA��lG����(hD��>�˶��~�f��&]�ˢ�a���(�E�"b��n� �U�����cZ���w�a@���XCV\�G���b�=m���<y,����8����� ��������k�)."^������P���Ã�tf�?�py���D?�ޏE�>=�O�}Rg`�m����a�Տ��r��'�	����^�B��~pc�yM��nS���^/�V��R���
037��,�>C	�Y�⼥�_�v�g�l���G-%��^"�L�����{3da��`�>�?�-���:����n�3T��=ˈ��N���2���P)�萠b���M�,O�":�ѡ%�;W<�B6���7�Z]�U�}��ރ�ޕPX��|M�F?9��/��B��) W�s�B�Q�Ƒ��7﬑=�{�9�S�a�(��\�u��Hh~\>��=�DI������22�E���
F
U]�sH��
m��m�� IW���W�L�V���np꽅�����>��������Q�	Aw���~~U5���bU�m  �|	 x����9��;��c�g�q5"
��̋��W���G�>ܱ��Z�L%	d�0B��.��?<�<|%1�A޴A ���8xlzp	��b��&j�Z�B��zvAR� �~&�7�37}�;[�{���׫������9��T�+�Vm�0�hHm��Q��^b��L��%���|2-�_}2'qu��X��}(�.T��D��+m׿� ��E�}�Μ�������4��x����/�0
t�n^HM��]}{��}���3���w#h�L^<�g�rth�4�����}GpFYd�5K���D�j��(�;�Ptka�SDWU�|w`���R������l���4w����J~������X��ी}=���H�Ɂ=����� p|�nJ��򼿹 �.��[N�E�	�A�XK�%����B��/���*>����8�_������G�)
�R[�.�
��!��wG�@���ո��V���.S���2��3��C����y�X!&�6���d�~� �gA�U�Ԗ� ��4�]�g�X�j��(0�_��u����o����/�v�:��&��6ޮ�l��0FQ:����E�Qx��l����+��K���j��~��(�����Z
nN%:=��/��Z�S\d�w��:n�eOK$����`���F�xSO�yDP=��[Z�&$�RA���3=@ϗ*8�*�W�]��U�U{@���BH�E yT�������O��.p)���*U���J�-��<��'�����3��U%�=q��*�9���h���/Q�������5�´�М�d��w��pc8�N��U!�kBq- X���4�?*=:0B#xf~�x1Ǧ����qg��"��#��xJ5O�Fk�*oîD}�NA�,��R�Α��.�G]��V��ᶌ����qJ�5��/U~ǫ}Qy�)B�&R�b�]�Կ�p!�g�GU;r��P_�L�V��#HFwV�N�a�裃�+8ޓ��
��P6P;�=?����c��%�/���Fۍ�UR�J��z�+��o����Ŀ\��ȴ;pk0R�	������坐�[���Z?�==�E������zq�c� ����<�Ep'v7�֏�}��8FA����C�>鹗8bU�y	<���xh)�H�V'�Ix���OC�ğQ{��AM��_�= �`� nzt�WD�Ý�঱'��);�0�4����V.�t��n(���{���֛�b2��e�9r���R�&���|u��S��o?���$(T^?�慨�]l���^��
���)��^#��W��?T�b�^����!IU�yp ��p� ��U3�W�ǂR�P{� +�K�ET�Lc�;ʘ3�ph�J���? ϩ�U%�Y�=����]�*e���7Z;�R	j��@�qr����wԄ���h`>��m�?���Z��s$��PP� �@ޫS��E[qT�6C�\��x/���W�����Q�Q�%���0�JT��/BG�U(�j4	������������>�?�Kꆷ7�/�Q��t�U�Xԫ��v���u��������_%�������LA����X��b@���@<�����/ US}�l`�f�(�~�$��f��A��X?UD�����"P0@*
����U����y�`��|T=�09�ڀe�5!�8#q��P�򗏽�|w�I��,���e���2� �Ġ`B��Q�~���U���<����P�ժ�P�d�6(;���P)��c��R�Q�"����8<���A��`n�J�G�3�ƻobm��� <J �Gx�ˇ�ޫ�*'�qal�6x
}-b�X�V�Uzg�Xs��/G�����j^]��G�USiz��)R�@e�\� �A*TχvE6&1�?~�S��;��)�-�h�e<0
�P���>T�����)��C	���ʀ�x�>��`��G�l�����@��/�>��;���(��b�SG��W�}1ΟO���۸N��c�B�bw�R�$�'r�L5 o�N�՞o���Iˁ;���$��|�vDvȸK_��o.�r(���y_��zN�;Us)����pw(���Xp����/M]�z�����G�5_��6�v��1���WZֵ�̪��n�@'���c.��wn�l��;	��)�:�-�>��J�H� ܔ����a�� �ek3�k7��v��,!��j��WͰD^?.�)������Z������瀦��?U���+	��r��_J��&�����Q.��Y��*��w�xx)�9�y�\�����de�1P����)�6|�ͧ�y��
�  ��V<�:}>��mGFH�AD��� ��^��4��:>����$ �>�:t� �(+zޕ²���h���$i�A2#68�D�{EQ�>���JN���脭 p��=�FTP�i(�NϟH*j/���%�@�}�S�2�vG�Ī�J���i�f��2�g4F�=xCs_t����&��������� ���rg�r��`�Q������ �A�3�c�~�$U �G�?�?Ĺ��	FPǴ�� #~�	���g�ޝB֞�"g�i���t��t����<4��{���{g��2>����pq���>�0�8?�DH�J�K�QH�ZcN��8�I����Qj�Ă{վ�"9=y�,�����$ON	 7:�� �KK^�*��cM�G4�� ��(87S�T�pL5xt�G~h��Ӊ��3r�L�t�"��ƿ����H�Czɴf��Z�F�Y��e�A����m�b��2���>���"vH��_D���}���Q�a!�P-*eN`Ϧa@��h���`/"���=vJx���NzR�T�B:�v�vX�>� 8e)��H��1��^��yS��#��Ur��T�U�hu�E[Ң"��c����:`��9�l�GT�,�ц�Pt ~�N"�4�y�*�"��t�h*���m��p�`vsDs�VL�i2˟�3��ၦ��$y8��^�1f�e�]Jn�����}`��{x�Zl:#y󱱮��'���`6� }%��R0�`oQ�@)8 ~��:p��&��T�YX�������LfՈ��o�*J���sx�U��_������#�.>���P>�.�Lm���V�M���`�W�N ^�?O�eI#(�S��K�BT��	c�&-:|�<��.TY ��f�4RǧHTչ�tT��$�N���!�w� |=: ����	;��d�F#��$�PU��b���C�0�m���IFP��xK��k�é�z΃ �u-�Ҩ�����}y����I�.��� ���M��_J1j�E��8�2h�MW��g�R5r0�N`�n�8R'�͜�.+��qah�%	�bB��i$$ΗH�$}.�u2
�CN�� �7�� ��mt�ւD��[
�x�a0�dE�}S�+c�J4
�ziQ�� ��11ѱ���c�!	�7��QNUə�	����+���U��/����z�Y�Z�6��8�`Wi�(SiZz@i� � |�����S+&h�l4^\�{Mx�ZH�SY<"���S��*�xЈ���F���������F��)ʙ�_�7�	o��&�QZ4\�${)��6[�40�M�Ă�Q�8�}bq"J�1��W��� �m5J:Q'��N( �9�B�	�Ξ����!�(���ᵫ���g����`���W�����(���[J+�!ֈF�z6LE��˙Ɔދ�8�/k0fg�_�|�SRK�i�Q�an!$[��=I6��0Es�駭���4�&I*za� �Ң����n����xf*����S|��AIQ�BV��1爥�
�֐����t��H>)S �n��&1���S����^��c(P��On$���B�q�<�v������>M�+��G�bm:|>쵲=�
OI���W��~y��	PF9w�I�|6;��z����#�$@C ���#b{�