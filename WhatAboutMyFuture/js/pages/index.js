function intHero(){
    const images=document.querySelectorAll(".hero-visual .hero-image")
    let currentImage=0;
    if (images.length===0) {
        return;
    }
    function showImage(){
        images.forEach((image,index)=>{
            image.classList.toggle("is-active",index===currentImage);
        })
    }
    showImage();


    const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
    if (images.length===1||reduceMotion.matches) {
        return;
    }
    setInterval(()=>{
currentImage = (currentImage + 1) % images.length;
        showImage();
    },4000);
}
intHero();