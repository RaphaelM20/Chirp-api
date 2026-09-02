const { Router } = require("express");
const router = Router();
const indexController = require("../controllers/indexController");
const passport = require("passport");

router.get(
  "/posts/:id/comment",
  passport.authenticate("jwt", { session: false }),
  indexController.commentsGet,
);

router.post(
  "/posts/:id/comment",
  passport.authenticate("jwt", { session: false }),
  indexController.commentsPost,
);

module.exports = router;
