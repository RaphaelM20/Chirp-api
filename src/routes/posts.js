const { Router } = require("express");
const router = Router();
const indexController = require("../controllers/indexController");
const passport = require("passport");

router.get(
  "/posts",
  passport.authenticate("jwt", { session: false }),
  indexController.allPostsGet,
);

router.get(
  "/posts/:id",
  passport.authenticate("jwt", { session: false }),
  indexController.singlePostGet,
);

router.post(
  "/posts",
  passport.authenticate("jwt", { session: false }),
  indexController.createPost,
);

router.delete(
  "/posts/:postId",
  passport.authenticate("jwt", { session: false }),
  indexController.deletePost,
);

module.exports = router;
