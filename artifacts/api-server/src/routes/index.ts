import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import generateRouter from "./generate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(modelsRouter);
router.use(generateRouter);

export default router;
