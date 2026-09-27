import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const response = await fetch(
    "https://app.mobitechtechnologies.com/sms/sendsms",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        h_api_key:
          "28a34ee09f5e7c3d4706ac3d37dda0a73a20ac99f601955e1ded0c570836c47a",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  return NextResponse.json(data);
}
