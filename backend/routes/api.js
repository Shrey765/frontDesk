import { Router } from "express";
import { createCustomerRequests, getAllCustomerRequests, resolveCustomerRequest, getKnowledgeBase } from "../controllers/cutomer.controller.js";
import { normalize } from "../utils/text.utils.js";
import {agentTurn} from "../controllers/agent.controller.js"

const router = Router();

//Agent route
router.route('/agent/turn').post(agentTurn);

//create customer request
router.route('/customer-requests/escalate').post(normalize, createCustomerRequests);
// get all customer requests
router.route('/customer-requests/all').get(getAllCustomerRequests);
// request resolve route
router.route('/customer-requests/:id/resolve').post(resolveCustomerRequest);
//LiveKit integration routes can be added here in future
router.route('/knowledge-base').get(normalize,getKnowledgeBase);

router.get('/', (req, res) => {
    res.json({ message: "API router is working!" });
});


export default router;