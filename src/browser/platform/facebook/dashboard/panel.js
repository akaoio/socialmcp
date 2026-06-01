export const panel = `
<div class="panelhead">
  <h1>Facebook Pages</h1>
</div>

<div class="twocol">

  <section class="card">
    <div class="cardhead">
      <h2>My Pages</h2>
      <button class="secondarybtn" id="fb-scan">Scan pages</button>
    </div>
    <div class="pageslist" id="fb-pages">
      <span class="hint">Click "Scan pages" — make sure facebook.com is open in a tab.</span>
    </div>
  </section>

  <section class="card">
    <div class="cardhead"><h2>Create post</h2></div>

    <label class="field">
      Content
      <textarea id="fb-content" placeholder="What's on your mind?" rows="5"></textarea>
    </label>

    <label class="field">
      Images <span class="muted">(optional)</span>
      <div class="imagedrop" id="fb-imagedrop">
        <input type="file" id="fb-imagefile" accept="image/*,video/*" multiple />
        <span id="fb-imagehint">Click or drop images here</span>
        <div id="fb-imagepreviews" class="imagethumbrow" hidden></div>
        <button id="fb-imageclear" class="ghostbtn removebtn" hidden>\u2715 Remove all</button>
      </div>
    </label>

    <label class="field">
      Post to
      <div class="targetsbox" id="fb-targets"></div>
    </label>

    <div class="rowactions">
      <button class="primarybtn" id="fb-post">Post</button>
    </div>
  </section>

</div>

<section class="card">
  <div class="cardhead"><h2>Activity</h2></div>
  <pre class="log" id="fb-log">Ready.</pre>
</section>
`;
