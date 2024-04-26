import { Client } from "@planetscale/database";
import { getCookie, setCookie } from "cookies-next";
import crypto from "crypto";
import { NextApiRequest, NextApiResponse } from "next";

const client = new Client({
  url: process.env.DATABASE_URL,
});

export const conn = client.connection();

type Data = Record<string, any>;

export interface SqlUser {
  id: string;
  discord_id: string;
  cookie_secret: string;
  discord_avatar: string;
  discord_name: string;
}

export interface Player {
  _id?: string;
  general?: object;
  bundles?: Array<object>;
  fishing?: object;
  cooking?: object;
  crafting?: object;
  shipping?: object;
  museum?: object;
  social?: object;
  monsters?: object;
  walnuts: object;
  notes?: object;
  scraps?: object;
  perfection?: object;
  powers?: object;
}

export async function getUID(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
): Promise<string> {
  // console.log("Getting UID from cookie...");
  let uid = getCookie("uid", { req, res });
  // console.log("UID: ", uid);
  if (uid) {
    // console.log("Found UID...");
    // uids can be anonymous, so we need to check if the user exists
    const user = (
      await conn.execute("SELECT * FROM Users WHERE id = ? LIMIT 1", [uid])
    )?.rows[0] as SqlUser | undefined;

    if (user) {
      // user exists, so we check if the user is authenticated
      // verify that the user has a stored token
      let token = getCookie("token", { req, res });
      if (!token) {
        res.status(400);
        throw new Error("User is not authenticated (1)");
      }
      // verify that the token is valid
      const { valid, userId } = verifyToken(
        token as string,
        user.cookie_secret,
      );
      if (!valid || userId !== uid) {
        res.status(400);
        throw new Error(`User is not authenticated (valid token: ${valid})`);
      }
    }
    // everything is ok, so we return the uid
    return uid as string;
  } else {
    // console.log("Generating new UID...");
    // no uid, so we create an anonymous one
    uid = crypto.randomBytes(16).toString("hex");
    setCookie("uid", uid, {
      req,
      res,
      maxAge: 60 * 60 * 24 * 365,
      domain: parseInt(process.env.NEXT_PUBLIC_DEVELOPMENT!)
        ? "localhost"
        : "stardew.app",
    });
  }
  return uid;
}

// magic functions dreamt up by me, i think they're secure lol, i use them a lot - Leah
export const createToken = (userId: string, key: string, validFor: number) => {
  const expires = Math.floor(new Date().getTime() / 1000 + validFor);
  const salt = crypto.randomBytes(8).toString("hex");
  const payload = Buffer.from(`${expires}.${userId}.${salt}`, "utf8").toString(
    "base64",
  );
  const signature = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("hex");
  return { token: `${payload}.${signature}`, expires };
};

export const verifyToken = (token: string, key: string) => {
  const [payload, signature] = token.split(".");
  const decoded = Buffer.from(payload, "base64").toString("utf8");
  const [expires, userId] = decoded.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("hex");
  return {
    valid:
      signature === expectedSignature &&
      parseInt(expires) > Math.floor(new Date().getTime() / 1000),
    userId,
  };
};

async function get(req: NextApiRequest, res: NextApiResponse) {
  // console.log("Getting...");
  const uid = await getUID(req, res);
  // console.log("uid: ", uid);
  const players = (
    await conn.execute("SELECT * FROM Saves WHERE user_id = ?", [uid])
  )?.rows as any[] | undefined;

  res.json(players);
}

async function post(req: NextApiRequest, res: NextApiResponse) {
  // console.log("Saving...");
  // console.log(process.env.DATABASE_URL);
  const uid = await getUID(req, res);
  const players = JSON.parse(req.body) as Player[];
  for (const player of players) {
    try {
      const r = await conn.execute(
        `
        REPLACE INTO Saves (_id, user_id, general, bundles, fishing, cooking, crafting, shipping, museum, social, monsters, walnuts, notes, scraps, perfection, powers)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          player._id,
          uid,
          player.general ? JSON.stringify(player.general) : "{}",
          player.bundles ? JSON.stringify(player.bundles) : "[]",
          player.fishing ? JSON.stringify(player.fishing) : "{}",
          player.cooking ? JSON.stringify(player.cooking) : "{}",
          player.crafting ? JSON.stringify(player.crafting) : "{}",
          player.shipping ? JSON.stringify(player.shipping) : "{}",
          player.museum ? JSON.stringify(player.museum) : "{}",
          player.social ? JSON.stringify(player.social) : "{}",
          player.monsters ? JSON.stringify(player.monsters) : "{}",
          player.walnuts ? JSON.stringify(player.walnuts) : "{}",
          player.notes ? JSON.stringify(player.notes) : "{}",
          player.scraps ? JSON.stringify(player.scraps) : "{}",
          player.perfection ? JSON.stringify(player.perfection) : "{}",
          player.powers ? JSON.stringify(player.powers) : "{}",
        ],
      );
      // console.log(r);
      res.status(200).end();
    } catch (e) {
      // console.log(e);
      res.status(500).end();
    }
  }
}

async function _delete(req: NextApiRequest, res: NextApiResponse) {
  // console.log("Deleting...");
  const uid = await getUID(req, res);

  if (!req.body) {
    // delete all players
    const result = await conn.execute("DELETE FROM Saves WHERE user_id = ?", [
      uid,
    ]);
    // console.log("[DEBUG:SAVES] DELETE | deleted all players with uid =", uid);
  } else {
    // console.log("[DEBUG:SAVES] DELETE | req.body =", req.body);
    const { type } = JSON.parse(req.body);

    if (type === "player") {
      // delete a single player
      const { _id } = JSON.parse(req.body);
      const result = await conn.execute(
        "DELETE FROM Saves WHERE user_id = ? AND _id = ?",
        [uid, _id],
      );

      // console.log("[DEBUG:SAVES] DELETE | deleted one player with id =", _id);
    } else {
      // delete entire account
      // delete players
      const result = await conn.execute("DELETE FROM Saves WHERE user_id = ?", [
        uid,
      ]);
      // delete user
      const result2 = await conn.execute("DELETE FROM Users WHERE id = ?", [
        uid,
      ]);
      // console.log("[DEBUG:SAVES] DELETE | deleted account with uid =", uid);
    }
  }
  // console.log(result.rowsAffected)
  res.status(204).end();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    switch (req.method) {
      case "GET":
        return await get(req, res);
      case "POST":
        return await post(req, res);
      case "DELETE":
        return await _delete(req, res);
    }
    res.status(405).end();
  } catch (e: any) {
    res.send(e.message);
  }
}
