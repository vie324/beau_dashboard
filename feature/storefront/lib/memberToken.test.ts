import { describe, it, expect } from "vitest";
import {
  signMemberToken,
  verifyMemberToken,
  MEMBER_TOKEN_TTL_MS,
} from "@/feature/storefront/lib/memberToken";

describe("memberToken", () => {
  const claims = { customerId: 42, shopId: 7 };

  it("署名→検証で往復する", () => {
    const t = signMemberToken(claims);
    expect(verifyMemberToken(t)).toEqual(claims);
  });

  it("期限切れは null", () => {
    const issued = Date.now() - MEMBER_TOKEN_TTL_MS - 1000;
    const t = signMemberToken(claims, issued);
    expect(verifyMemberToken(t)).toBeNull();
    // 発行時点では有効
    expect(verifyMemberToken(t, issued + 1000)).toEqual(claims);
  });

  it("改ざん（本文差し替え）は null", () => {
    const t = signMemberToken(claims);
    const [, mac] = t.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ c: 1, s: 7, exp: Date.now() + 100000 }),
    ).toString("base64url");
    expect(verifyMemberToken(`${forgedBody}.${mac}`)).toBeNull();
  });

  it("壊れた形式は null", () => {
    expect(verifyMemberToken(null)).toBeNull();
    expect(verifyMemberToken("")).toBeNull();
    expect(verifyMemberToken("abc")).toBeNull();
    expect(verifyMemberToken("abc.def")).toBeNull();
  });
});
