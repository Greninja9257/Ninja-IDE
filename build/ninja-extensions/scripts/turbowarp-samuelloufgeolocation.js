// Name: Geolocation
// ID: samuelloufgeolocation
// Description: Get the user's current location (requires permission from browser). Not supported in desktop app or Electron packaged projects.
// By: SamuelLouf <https://scratch.mit.edu/users/samuellouf/>
// License: MIT

/* generated l10n code */Scratch.translate.setup({"fi":{"_Geolocation":"Geopaikannus","_Not supported in desktop app":"Ei toimi työpöytäsovelluksessa","_accuracy (meters)":"tarkkuus (metreinä)","_device supports geolocation?":"tukeeko laite geopaikannusta?","_geolocation allowed?":"onko geopaikannus sallittu?","_get position once and wait":"määritä sijainti kerran ja odota","_get timeout":"katkaisuaika","_high":"suureksi","_is high accuracy?":"onko tarkkuus suuri?","_latitude":"leveysaste","_longitude":"pituusaste","_low":"pieneksi","_set accuracy to [ACCURACY]":"aseta tarkkuus [ACCURACY]","_set timeout to [SECONDS] seconds":"aseta katkaisuajaksi [SECONDS] s","_start watching position":"aloita sijainnin tarkkailu","_stop watching position":"lopeta sijainnin tarkkailu","_watching position?":"tarkkaillaanko sijaintia?","_when location changed":"kun sijainti muuttuu"},"it":{"_Geolocation":"Geolocalizzazione","_Not supported in desktop app":"Non supportato dall'app desktop","_accuracy (meters)":"accuratezza (metri)","_device supports geolocation?":"dispositivo supporta geolocalizzazione","_geolocation allowed?":"geolocalizzazione permessa","_get position once and wait":"ottieni posizione e attendi","_get timeout":"ottieni timeout","_high":"alta","_is high accuracy?":"accuratezza alta","_latitude":"latitudine","_longitude":"longitudine","_low":"bassa","_set accuracy to [ACCURACY]":"usa accuratezza [ACCURACY]","_set timeout to [SECONDS] seconds":"imposta timeout a [SECONDS] secondi","_start watching position":"inizia rilevazione posizione","_stop watching position":"termina rilevazione posizione","_watching position?":"rilevazione posizione attiva","_when location changed":"quando la posizione cambia"},"ja":{"_Geolocation":"位置情報","_Not supported in desktop app":"デスクトップアプリではサポートしていません","_accuracy (meters)":"精度（メートル）","_device supports geolocation?":"このデバイスが位置情報の取得に対応しているか","_geolocation allowed?":"位置情報の取得が許可されているか","_get position once and wait":"位置情報を取得して待つ","_get timeout":"タイムアウトしているか","_high":"高","_is high accuracy?":"精度が高い","_latitude":"緯度","_longitude":"経度","_low":"低","_set accuracy to [ACCURACY]":"精度を[ACCURACY]にする","_set timeout to [SECONDS] seconds":"タイムアウトを[SECONDS]秒にする","_start watching position":"位置情報の観測をはじめる","_stop watching position":"位置情報の観測を止める","_watching position?":"位置情報を観測中","_when location changed":"位置が変わったとき"},"ko":{"_Geolocation":"위치 정보"},"ru":{"_Geolocation":"Геолокация","_Not supported in desktop app":"Не поддерживается в десктопном приложении","_accuracy (meters)":"точность (в метрах)","_device supports geolocation?":"устройство поддерживает геолокацию?","_geolocation allowed?":"геолокация разрешена?","_get position once and wait":"получить позицию единожды и подождать","_get timeout":"получить ожидание","_high":"высокую","_is high accuracy?":"точность высокая?","_latitude":"широта","_longitude":"высота","_low":"низкую","_set accuracy to [ACCURACY]":"задать точность на [ACCURACY]","_set timeout to [SECONDS] seconds":"задать ожидание на [SECONDS] секунд","_start watching position":"начать смотреть позицию","_stop watching position":"остановить осмотр позиции","_watching position?":"смотрит позицию?","_when location changed":"когда локация изменена"},"zh-cn":{"_Geolocation":"地理位置","_Not supported in desktop app":"不支持桌面应用","_accuracy (meters)":"精度（米）","_device supports geolocation?":"设备支持地理定位？","_geolocation allowed?":"允许使用地理位置？","_get position once and wait":"定位一次并等待","_get timeout":"获取超时时长","_high":"高","_is high accuracy?":"高精度？","_latitude":"纬度","_longitude":"经度","_low":"低","_set accuracy to [ACCURACY]":"将精度设为[ACCURACY]","_set timeout to [SECONDS] seconds":"将超时时长设为[SECONDS]秒","_start watching position":"开始监视位置","_stop watching position":"停止监视位置","_watching position?":"正在监视位置？","_when location changed":"当位置变化时"}});/* end generated l10n code */(function (Scratch) {
  "use strict";

  const menuIconURI =
    "data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHdpZHRoPSIxMTAuODAyNSIgaGVpZ2h0PSIxMTAuNDAyNDkiIHZpZXdCb3g9IjAsMCwxMTAuODAyNSwxMTAuNDAyNDkiPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xODQuNTk4NzUsLTEyNC43OTg3NSkiPjxnIGRhdGEtcGFwZXItZGF0YT0ieyZxdW90O2lzUGFpbnRpbmdMYXllciZxdW90Ozp0cnVlfSIgc3Ryb2tlLWxpbmVjYXA9ImJ1dHQiIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiIHN0cm9rZS1taXRlcmxpbWl0PSIxMCIgc3Ryb2tlLWRhc2hhcnJheT0iIiBzdHJva2UtZGFzaG9mZnNldD0iMCIgc3R5bGU9Im1peC1ibGVuZC1tb2RlOiBub3JtYWwiPjxwYXRoIGQ9Ik0xODQuNTk4NzUsMjM1LjIwMTI1di0xMTAuNDAyNDloMTEwLjgwMjV2MTEwLjQwMjQ5eiIgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJub256ZXJvIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMCIvPjxwYXRoIGQ9Ik0yNDEuNzc3MTQsMjE2LjQwNzcyYy0wLjU0NTUyLDAuNDA5NjQgLTEuMjg5MjEsMC40MzM2MyAtMS44NiwwLjA2Yy02LjE0MzY2LC0zLjg2ODY0IC0xMS41OTg1OSwtOC43MzU1IC0xNi4xNCwtMTQuNGMtNS41NTkxLC02Ljc1NTkyIC05LjI5NzYsLTE0LjgyMTU4IC0xMC44NiwtMjMuNDNjLTEuMjksLTcuOTkgLTAuMDYsLTE1LjY3IDMuOTQsLTIxLjkyYzEuNjE0OTMsLTIuNTM4ODEgMy42NDI4NywtNC43ODk4MyA2LC02LjY2YzUuMTU3NjksLTQuMzA2MjUgMTEuNjQxNSwtNi43MDQxMyAxOC4zNiwtNi43OWM2LjUwNTg5LDAuMTA0OTYgMTIuNzM1OTYsMi42NDU1MSAxNy40Niw3LjEyYzEuODE0MzUsMS42NjMyMiAzLjM4MzM1LDMuNTc1NjQgNC42Niw1LjY4YzQuMjcsNyA1LjE5LDE2IDMuMzEsMjUuMTJjLTMuMTgyMzQsMTQuNjIxNzcgLTEyLjE1NTQ4LDI3LjMyOTIyIC0yNC44NywzNS4yMnpNMjQwLjAwNzE0LDE1Ny40Nzc3MWM3LjU3NzM1LDAgMTMuNzIsNi4xNDI2NSAxMy43MiwxMy43MmMwLDcuNTc3MzUgLTYuMTQyNjUsMTMuNzIgLTEzLjcyLDEzLjcyYy03LjU3NzM1LDAgLTEzLjcyLC02LjE0MjY1IC0xMy43MiwtMTMuNzJjMCwtNy41NzczNSA2LjE0MjY1LC0xMy43MiAxMy43MiwtMTMuNzJ6IiBmaWxsPSIjMDM2ZTE1IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHN0cm9rZT0iIzAwYTExYiIgc3Ryb2tlLXdpZHRoPSIxLjUiLz48L2c+PC9nPjwvc3ZnPjwhLS1yb3RhdGlvbkNlbnRlcjo1NS40MDEyNTAwMDAwMDAwMDU6NTUuMjAxMjQ1LS0+";

  const MOVEMENT_THRESHOLD_DEGREES = 5 * 10 ** -5; // ~ 5.5 meters

  /** @type {Required<PositionOptions>} */
  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0,
  };

  /** @type {number|null} */
  let latitude = null;
  /** @type {number|null} */
  let longitude = null;
  /** @type {number|null} accuracy of the position, in meters */
  let accuracy = null;

  /** @type {number|null} */
  let watcherID = null;

  /**
   * @param {PositionOptions} options
   * @returns {Promise<{latitude: number; longitude: number; accuracy: number}|null>}
   */
  function getGeolocation(options) {
    return new Promise((resolve) => {
      /** @type {PositionCallback} */
      const success = (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      };

      /** @type {PositionErrorCallback} */
      const error = (err) => {
        console.warn(err);
        resolve(null);
      };

      navigator.geolocation.getCurrentPosition(success, error, options);
    });
  }

  /**
   * @param {number|null} oldLatitude
   * @param {number|null} oldLongitude
   * @param {number} newLatitude
   * @param {number} newLongitude
   * @returns {boolean}
   */
  function hasMoved(oldLatitude, oldLongitude, newLatitude, newLongitude) {
    return (
      oldLatitude === null ||
      oldLongitude === null ||
      Math.abs(oldLatitude - newLatitude) >= MOVEMENT_THRESHOLD_DEGREES ||
      Math.abs(oldLongitude - newLongitude) >= MOVEMENT_THRESHOLD_DEGREES
    );
  }

  /**
   * Updates the stored position and, if it moved, fires "when location changed".
   * @param {{latitude: number; longitude: number; accuracy: number}} coords
   */
  function updatePosition(coords) {
    const moved = hasMoved(
      latitude,
      longitude,
      coords.latitude,
      coords.longitude
    );

    latitude = coords.latitude;
    longitude = coords.longitude;
    accuracy = coords.accuracy;

    if (moved) {
      Scratch.vm.runtime.startHats("samuelloufgeolocation_onUserMove");
    }
  }

  /**
   * @returns {boolean}
   */
  function isElectron() {
    return navigator.userAgent.includes("Electron");
  }

  /**
   * @returns {boolean}
   */
  function isSupported() {
    return !!navigator.geolocation && !isElectron();
  }

  /**
   * @returns {Promise<boolean>}
   */
  async function canGeolocate() {
    if (!isSupported()) {
      return false;
    }

    const allowedByVM = await Scratch.canGeolocate();
    if (!allowedByVM) {
      return false;
    }

    const allowedByBrowser = await navigator.permissions.query({
      name: "geolocation",
    });
    return allowedByBrowser.state !== "denied";
  }

  class Geolocation {
    getInfo() {
      return {
        id: "samuelloufgeolocation",
        name: Scratch.translate("Geolocation"),
        color1: "#036e15",
        color2: "#00A11B",
        color3: "#04C825",
        menuIconURI,
        blocks: [
          ...(isElectron()
            ? [
                {
                  blockType: Scratch.BlockType.LABEL,
                  text: Scratch.translate("Not supported in desktop app"),
                },
              ]
            : []),
          {
            opcode: "isSupported",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("device supports geolocation?"),
          },
          {
            opcode: "isAllowed",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("geolocation allowed?"),
          },
          "---",
          {
            opcode: "getPositionOnce",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("get position once and wait"),
          },
          {
            opcode: "getLatitude",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("latitude"),
          },
          {
            opcode: "getLongitude",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("longitude"),
          },
          {
            opcode: "getAccuracy",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("accuracy (meters)"),
          },
          "---",
          {
            opcode: "onUserMove",
            blockType: Scratch.BlockType.EVENT,
            text: Scratch.translate("when location changed"),
            isEdgeActivated: false,
          },
          {
            opcode: "startWatching",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("start watching position"),
          },
          {
            opcode: "stopWatching",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("stop watching position"),
          },
          {
            opcode: "isWatchingPos",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("watching position?"),
          },
          "---",
          {
            opcode: "setTimeoutTo",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set timeout to [SECONDS] seconds"),
            arguments: {
              SECONDS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 10,
              },
            },
          },
          {
            opcode: "getTimeout",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("get timeout"),
          },
          {
            opcode: "setAccuracy",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set accuracy to [ACCURACY]"),
            arguments: {
              ACCURACY: {
                type: Scratch.ArgumentType.STRING,
                menu: "accuracy",
              },
            },
          },
          {
            opcode: "isHighAccuracy",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("is high accuracy?"),
          },
        ],
        menus: {
          accuracy: {
            acceptReporters: true,
            items: [
              {
                text: Scratch.translate("high"),
                value: "high",
              },
              {
                text: Scratch.translate("low"),
                value: "low",
              },
            ],
          },
        },
      };
    }

    async getPositionOnce() {
      if (!(await canGeolocate())) return;
      const result = await getGeolocation(options);
      if (result) {
        updatePosition(result);
      }
    }

    getLatitude() {
      return latitude === null ? "" : latitude;
    }

    getLongitude() {
      return longitude === null ? "" : longitude;
    }

    getAccuracy() {
      return accuracy === null ? "" : accuracy;
    }

    async startWatching() {
      if (watcherID !== null || !(await canGeolocate())) return;
      watcherID = navigator.geolocation.watchPosition(
        (pos) => updatePosition(pos.coords),
        (err) => {
          console.warn(err);
        },
        options
      );
    }

    stopWatching() {
      if (watcherID === null || !isSupported()) return;
      navigator.geolocation.clearWatch(watcherID);
      watcherID = null;
    }

    isWatchingPos() {
      return watcherID !== null;
    }

    async isAllowed() {
      return await canGeolocate();
    }

    isSupported() {
      return isSupported();
    }

    setTimeoutTo(args) {
      options.timeout = Scratch.Cast.toNumber(args.SECONDS) * 1000;
    }

    getTimeout() {
      return options.timeout / 1000;
    }

    setAccuracy(args) {
      options.enableHighAccuracy = args.ACCURACY === "high";
    }

    isHighAccuracy() {
      return options.enableHighAccuracy;
    }
  }
  // @ts-ignore
  Scratch.extensions.register(new Geolocation());
  // @ts-ignore
})(Scratch);
