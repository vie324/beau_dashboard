import { describe, expect, it } from "vitest";
import { parseRecipients } from "@/helper/lib/mailer";

describe("parseRecipients", () => {
  it("空・未設定は宛先なし", () => {
    expect(parseRecipients(null)).toEqual([]);
    expect(parseRecipients(undefined)).toEqual([]);
    expect(parseRecipients("   ")).toEqual([]);
  });

  it("カンマ・空白・セミコロン区切りを受け付ける", () => {
    expect(parseRecipients("a@x.com, b@y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
    expect(parseRecipients("a@x.com b@y.com;c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("重複は1つにまとめる", () => {
    expect(parseRecipients("a@x.com, a@x.com")).toEqual(["a@x.com"]);
  });

  it("@ を含まない値は捨てる", () => {
    expect(parseRecipients("notmail, a@x.com")).toEqual(["a@x.com"]);
  });
});
