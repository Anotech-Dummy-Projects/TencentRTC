import axios from "axios";
import { Api as TLSSigApi } from "tls-sig-api-v2-typescript";

interface TencentRoamMsgParams {
  Operator_Account: string;
  Peer_Account: string;
  MaxCnt: number;
  MinTime: number;
  MaxTime: number;
  LastMsgKey?: string;
}

export interface TencentMessage {
  From_Account: string;
  To_Account: string;
  MsgTimeStamp: number;
  MsgBody: unknown[];
  MsgKey: string;
}

export class TencentApi {
  // Tencent IM admin API ka Singapore endpoint. Region intentionally fixed hai.
  private readonly baseUrl = "https://adminapisgp.im.qcloud.com";
  private readonly sdkAppId: number;
  private readonly secretKey: string;
  private readonly adminIdentifier = process.env.TRTC_ADMIN_IDENTIFIER || "administrator";

  constructor() {
    // Existing .env ke exact TRTC names use karo; no UserSig or secret source mein hardcode hai.
    this.sdkAppId = Number(process.env.TRTC_SDK_APP_ID);
    this.secretKey = process.env.TRTC_SECRET_KEY!;

    if (!this.sdkAppId || !this.secretKey) {
      throw new Error(
        "Missing TRTC credentials. Check TRTC_SDK_APP_ID and TRTC_SECRET_KEY in .env"
      );
    }
  }

  /** Admin account ke liye fresh, 180-day Tencent UserSig generate karta hai. */
  private getAdminUserSig(): string {
    try {
      // tls-sig-api-v2-node's typed package API; signature har Tencent request par fresh banta hai.
      const signatureApi = new TLSSigApi(this.sdkAppId, this.secretKey);
      return signatureApi.genUserSig(this.adminIdentifier, 15_552_000);
    } catch (error) {
      console.error("[Tencent] UserSig generation failed:", error);
      throw new Error("Failed to generate Admin UserSig");
    }
  }

  /**
   * C2C history ko Tencent se page-by-page fetch karta hai.
   * `Complete === 0` par LastMsgKey use karke next page mangta hai, jab tak all messages na mil jaayen.
   */
  async fetchFullHistory(
    params: Omit<TencentRoamMsgParams, "MaxCnt">
  ): Promise<TencentMessage[]> {
    const allMessages: TencentMessage[] = [];
    let lastMsgKey: string | undefined;
    let isComplete = false;

    while (!isComplete) {
      const payload: TencentRoamMsgParams = {
        ...params,
        MaxCnt: 100,
        ...(lastMsgKey ? { LastMsgKey: lastMsgKey } : {}),
      };

      try {
        const response = await axios.post(
          `${this.baseUrl}/v4/openim/admin_getroammsg`,
          payload,
          {
            params: {
              sdkappid: this.sdkAppId,
              identifier: this.adminIdentifier,
              usersig: this.getAdminUserSig(),
              random: Math.floor(Math.random() * 99_999_999),
              contenttype: "json",
            },
          }
        );

        if (response.data.ActionStatus !== "OK") {
          throw new Error(`Tencent API Error: ${response.data.ErrorInfo}`);
        }

        const messages = (response.data.MsgList || []) as TencentMessage[];
        allMessages.push(...messages);

        isComplete = response.data.Complete === 1;
        lastMsgKey = response.data.LastMsgKey;

        console.log(`[Tencent] Fetched ${messages.length} msgs. Complete: ${isComplete}`);

        // Complete=0 means Tencent says another page exists. Without its cursor,
        // continuing would request the first page again forever.
        if (!isComplete && !lastMsgKey) {
          throw new Error("Tencent API returned an incomplete page without LastMsgKey.");
        }
      } catch (error: any) {
        console.error("[Tencent] Fetch failed:", error.response?.data || error.message);
        throw error;
      }
    }

    console.log(`[Tencent] Total messages fetched: ${allMessages.length}`);
    return allMessages;
  }
}

export const tencentApi = new TencentApi();
