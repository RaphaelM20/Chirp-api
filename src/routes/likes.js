const { Router } = require("express");
const router = Router();
const indexController = require("../controllers/indexController");
const passport = require("passport");

router.post(
  "/posts/:id/likes",
  passport.authenticate("jwt", { session: false }),
  indexController.likePost,
);

router.post(
  "/comments/:id/likes",
  passport.authenticate("jwt", { session: false }),
  indexController.likeComment,
);

router.delete(
  "/posts/:id/likes",
  passport.authenticate("jwt", { session: false }),
  indexController.unlikePost,
);

router.delete(
  "/comments/:id/likes",
  passport.authenticate("jwt", { session: false }),
  indexController.unlikeComment,
);

module.exports = router;
