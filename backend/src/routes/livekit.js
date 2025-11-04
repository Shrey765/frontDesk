import {Router} from 'express'
import { AccessToken } from 'livekit-server-sdk';


const livekitRouter = Router();

livekitRouter.get('/getToken', async (req, res) => {
  // If this room doesn't exist, it'll be automatically created when the first
  // participant joins
  const { room = "demo", identity = `user-${Date.now()}` } = req.query;
  // Identifier to be used for participant.
  // It's available as LocalParticipant.identity with livekit-client SDK

  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity,
    // Token to expire after 10 minutes
    ttl: '10m',
  });
  at.addGrant({ roomJoin: true, room });

  const token = await at.toJwt();
  return res.json({url: process.env.LIVEKIT_URL, token, room, identity});
});

export default livekitRouter;