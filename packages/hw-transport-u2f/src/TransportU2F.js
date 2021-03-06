/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2016-2017 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
//@flow

import { sign, isSupported } from "u2f-api";
import Transport from "@ledgerhq/hw-transport";

function wrapApdu(apdu: Buffer, key: Buffer) {
  const result = Buffer.alloc(apdu.length);
  for (let i = 0; i < apdu.length; i++) {
    result[i] = apdu[i] ^ key[i % key.length];
  }
  return result;
}

// Convert from normal to web-safe, strip trailing "="s
const webSafe64 = (base64: string) =>
  base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// Convert from web-safe to normal, add trailing "="s
const normal64 = (base64: string) =>
  base64.replace(/-/g, "+").replace(/_/g, "/") +
  "==".substring(0, (3 * base64.length) % 4);
/**
 * U2F web Transport implementation
 * @example
 * import TransportU2F from "@ledgerhq/hw-transport-u2f";
 * ...
 * TransportU2F.create().then(transport => ...)
 */
export default class TransportU2F extends Transport<null> {
  static isSupported = isSupported;

  // this transport is not discoverable but we are going to guess if it is here with isSupported()
  static list = (): * =>
    isSupported().then(supported => (supported ? [null] : []));

  static listen = (observer: *) => {
    let unsubscribed = false;
    isSupported().then(supported => {
      if (!unsubscribed && supported)
        observer.next({ type: "add", descriptor: null });
    });
    return {
      unsubscribe: () => {
        unsubscribed = true;
      }
    };
  };

  scrambleKey: Buffer;

  /**
   * static function to create a new Transport from a connected Ledger device discoverable via U2F (browser support)
   */
  static open(): Promise<TransportU2F> {
    return Promise.resolve(new TransportU2F());
  }

  exchange(apdu: Buffer): Promise<Buffer> {
    const keyHandle = wrapApdu(apdu, this.scrambleKey);
    const challenge = Buffer.from(
      "0000000000000000000000000000000000000000000000000000000000000000",
      "hex"
    );
    const signRequest = {
      version: "U2F_V2",
      keyHandle: webSafe64(keyHandle.toString("base64")),
      challenge: webSafe64(challenge.toString("base64")),
      appId: location.origin
    };
    if (this.debug) {
      console.log("=> " + apdu.toString("hex"));
    }
    return sign(signRequest, this.exchangeTimeout / 1000).then(response => {
      const { signatureData } = response;
      if (typeof signatureData === "string") {
        const data = Buffer.from(normal64(signatureData), "base64");
        const result = data.slice(5);
        if (this.debug) {
          console.log("<= " + result.toString("hex"));
        }
        return result;
      } else {
        throw response;
      }
    });
  }

  setScrambleKey(scrambleKey: string) {
    this.scrambleKey = Buffer.from(scrambleKey, "ascii");
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
