using System;

namespace MesPremiersJeux.Gaze
{
    /// <summary>
    /// Source capable de fournir la position des yeux (fenêtre « Position des
    /// yeux ») : implémentée par le SDK grand public (GazeService) et par le
    /// Tobii Pro SDK (ProGazeSource).
    /// </summary>
    public interface IEyeStream
    {
        bool IsAvailable { get; }
        event Action<EyeSample> Eyes;
    }
}
