import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    gpu_available: false,
    cuda_version: null,
  });
});

export default router;
